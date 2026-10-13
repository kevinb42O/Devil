"""Extract original spawn coordinates from a local Devil Daggers replay.

Read-only; based on NoahStolk/ddinfo-core ReplayEventsParser and LocalReplayBinaryHeader.
Usage: python3 tools/analyze-spawn-replay.py /absolute/replay.ddreplay > report.json
Coordinates remain in original units. The replica uses WORLD_SCALE (.62).
"""
import collections
import hashlib
import json
import math
import struct
import sys
import zlib
from pathlib import Path


def extract(path):
    data = Path(path).read_bytes()
    if data[:6] != b"ddrpl.":
        raise ValueError("Expected a local ddrpl. replay")
    end, start = struct.unpack_from("<ff", data, 18)
    name_length = struct.unpack_from("<i", data, 50)[0]
    name = data[54:54 + name_length].decode("utf8")
    offset = 54 + name_length + 10
    expected_md5 = data[offset:offset + 16]
    offset += 16
    spawnset_length = struct.unpack_from("<i", data, offset)[0]
    offset += 4
    spawnset = data[offset:offset + spawnset_length]
    if hashlib.md5(spawnset).digest() != expected_md5:
        raise ValueError("Embedded spawnset MD5 mismatch")
    offset += spawnset_length
    compressed_length = struct.unpack_from("<i", data, offset)[0]
    offset += 4
    compressed = data[offset:offset + compressed_length]
    # The reference parser skips the ZLIB header; public fixtures can lack its footer.
    raw = zlib.decompressobj(-15).decompress(compressed[2:])
    sizes = {1: 30, 3: 32, 4: 32, 5: 32, 6: 45, 7: 64, 8: 16,
             9: 16, 10: 28, 11: 4, 12: 64, 13: 20, 15: 64}
    other_sizes = {1: 10, 2: 22, 4: 10, 5: 12, 6: 0, 7: 28, 11: 0}
    kinds = {3: "squid", 4: "squid2", 5: "squid3", 7: "centipede", 8: "spider",
             9: "spider2", 11: "leviathan", 12: "gigapede", 13: "thorn", 15: "ghostpede"}
    p = tick = entity = 0
    initial = True
    ended = False
    counts = collections.Counter()
    spawns = []
    offspring = []
    first_ids = {}
    motion = []
    while p < len(raw):
        event_type = raw[p]
        p += 1
        counts[event_type] += 1
        if event_type == 0:
            enemy_type = raw[p]
            p += 1
            entity += 1
            size = sizes[enemy_type]
            if enemy_type == 6:
                offspring.append(dict(parentId=struct.unpack_from("<i", raw, p)[0],
                                      tick=tick, type=raw[p + 4]))
            if enemy_type in kinds:
                event = dict(id=entity, kind=kinds[enemy_type], tick=tick, time=start + tick / 60)
                first_ids.setdefault(kinds[enemy_type], entity)
                if enemy_type != 11:
                    position = struct.unpack_from("<fff", raw, p + 4)
                    event.update(position=position, radius=math.hypot(position[0], position[2]),
                                 angle=math.atan2(position[0], position[2]))
                if enemy_type in (3, 4, 5):
                    event.update(direction=struct.unpack_from("<fff", raw, p + 16),
                                 rotation=struct.unpack_from("<f", raw, p + 28)[0])
                if enemy_type in (7, 12, 15):
                    event.update(vector=struct.unpack_from("<fff", raw, p + 16),
                                 orientation=struct.unpack_from("<9f", raw, p + 28))
                if enemy_type == 13:
                    event["rotation"] = struct.unpack_from("<f", raw, p + 16)[0]
                spawns.append(event)
            p += size
        elif event_type == 9:
            size = 16 if initial else 12
            if raw[p + size - 1] != 10:
                raise ValueError("Invalid input event terminator")
            p += size
            initial = False
            tick += 1
        elif event_type in other_sizes:
            if event_type == 1:
                entity_id = struct.unpack_from("<i", raw, p)[0]
                if entity_id in first_ids.values():
                    motion.append(dict(id=entity_id, tick=tick, time=start + tick / 60,
                                       position=[x / 16 for x in struct.unpack_from("<3h", raw, p + 4)]))
            p += other_sizes[event_type]
            if event_type == 11:
                ended = True
                break
        else:
            raise ValueError(f"Unknown event {event_type} at {p - 1}")
        if p > len(raw):
            raise ValueError("Truncated event stream")
    if not ended:
        raise ValueError("Missing end event")
    spawn_count = struct.unpack_from("<i", spawnset, 36 + 10404 + 36)[0]
    schedule = [struct.unpack_from("<if", spawnset, 36 + 10404 + 40 + i * 28)
                for i in range(spawn_count)]
    return dict(source=Path(path).name, sha256=hashlib.sha256(data).hexdigest(), player=name,
                start=start, end=end, ticks=tick, eventCounts=dict(counts),
                spawnsetSha256=hashlib.sha256(spawnset).hexdigest(),
                spawnsetHeader=dict(zip(["spawnVersion", "worldVersion", "shrinkEnd", "shrinkStart",
                                        "shrinkRate", "brightness", "gameMode", "arenaDimension", "unknown"],
                                       struct.unpack_from("<iiffffiii", spawnset))),
                schedule=schedule, spawns=spawns, firstEnemyMotion=motion,
                towerEmissions=[dict(id=e["id"], kind=e["kind"], spawnTick=e["tick"],
                                     children=[dict(tick=c["tick"], type=c["type"])
                                               for c in offspring if c["parentId"] == e["id"]])
                                for e in spawns if e["kind"].startswith("squid")])


if __name__ == "__main__":
    report = extract(sys.argv[1])
    if "--tower-emissions" in sys.argv:
        report = dict(source=report["source"], sha256=report["sha256"], towers=report["towerEmissions"])
    print(json.dumps(report, indent=2))
