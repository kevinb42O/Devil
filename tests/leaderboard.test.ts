import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eligibleForLeaderboard} from '../src/leaderboard';
import {RunRecorder,createRun,DEFAULT_SETUP} from '../src/replay';
test('only completed standard solo runs qualify for the public leaderboard',()=>{
 const w=createRun(1);w.time=12.345;const run=new RunRecorder(1).finish(w);
 assert.equal(eligibleForLeaderboard(run,false,false),true);
 assert.equal(eligibleForLeaderboard(run,true,false),false);
 assert.equal(eligibleForLeaderboard(run,false,true),false);
 assert.equal(eligibleForLeaderboard(null,false,false),false);
 for(const setup of [{...DEFAULT_SETUP,time:229},{...DEFAULT_SETUP,level:4},{...DEFAULT_SETUP,reserve:150}])assert.equal(eligibleForLeaderboard({...run,setup},false,false),false);
 assert.equal(eligibleForLeaderboard({...run,practice:true},false,false),false);
 assert.equal(eligibleForLeaderboard({...run,version:5},false,false),false);
 assert.equal(eligibleForLeaderboard({...run,time:NaN},false,false),false);
});
