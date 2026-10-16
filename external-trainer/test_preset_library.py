from dataclasses import asdict
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from preset_library import PresetLibrary
from settings import preset


class PresetLibraryTests(unittest.TestCase):
    def test_names_and_values_survive_restart_and_update(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'presets.json';library=PresetLibrary(path)
            first=library.save('My smooth aim',preset('Smooth'))
            self.assertEqual(first.profile,'My smooth aim')
            library=PresetLibrary(path)
            self.assertEqual(library.values['My smooth aim'],first)
            library.save('MY SMOOTH AIM',preset('Precision'))
            self.assertEqual(library.names(),['My smooth aim'])
            self.assertEqual(PresetLibrary(path).values['My smooth aim'].aim_mode,'snap')

    def test_failed_save_does_not_overwrite_existing_presets(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'presets.json';library=PresetLibrary(path)
            library.save('Original',preset('Smooth'));original=path.read_bytes()
            with patch.object(Path,'replace',side_effect=OSError('Disk unavailable')):
                with self.assertRaises(OSError):library.save('New',preset('Precision'))
            self.assertEqual(path.read_bytes(),original)
            self.assertEqual(library.names(),['Original'])
            self.assertEqual(list(Path(temp).glob('.presets-*.tmp')),[])

    def test_corrupt_library_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'presets.json';path.write_text('not valid JSON')
            library=PresetLibrary(path)
            with self.assertRaises(ValueError):library.save('New',preset('Smooth'))
            self.assertEqual(path.read_text(),'not valid JSON')

    def test_builtin_empty_and_control_character_names_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            library=PresetLibrary(Path(temp)/'presets.json')
            for name in ('','   ','Precision','smooth','Custom','x\ny','x'*49):
                with self.subTest(name=name),self.assertRaises(ValueError):library.save(name,preset('Smooth'))

if __name__=='__main__':unittest.main()
