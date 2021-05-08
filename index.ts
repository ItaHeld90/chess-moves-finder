import { compact } from 'lodash';
import { RunnerParams } from './types';
import {
    budapestDefensePath,
    exchangeCaroKannPath,
    friedLiverAttack,
    italianBirdAttack,
    italianGamePath,
    knightAttackPath,
    panovAttackPath,
    staffordGambitPath,
    staffordQueenPath,
} from './openings';
import { runner } from './crawl';
import { handleSaveResults } from './save-results';
import { sansPathToPGN } from './helper-utils';
import { driver } from './graph-db/graph-db';

init();

async function init() {
    // searchApi();
    searchGraph();
}

async function searchApi() {
    const runnerParams: RunnerParams = {
        startingPath: staffordGambitPath,
        shouldExpand: ({ numGames, depth }) => numGames > 300 && depth < 15,
        shouldRecord: ({ numGames, whitePercentage, blackPercentage }) => {
            return numGames > 300 && [whitePercentage, blackPercentage].some((percentage) => percentage > 85);
        },
        shouldStop: ({ millis }) => {
            const seconds = millis / 1000;

            if (seconds > 600) {
                console.log('timed out');
                return true;
            }

            return false;
        },
    };

    const { recordedPaths } = await runner(runnerParams);
    const sansToSave = compact(recordedPaths.map(({ path }) => path.san));
    const pgns = sansToSave.map((san) => sansPathToPGN(san));

    console.log('results:', pgns);

    await handleSaveResults(sansToSave);
}

async function searchGraph() {
    const session = driver.session();

    const results = await session.run(`
        MATCH (:Opening { title: "Stafford Gambit" })-[:START_POSITION]->(startBoard:BOARD)
        MATCH p = (startBoard)-[:MOVE*1..15]->(resultBoard:BOARD)
        WITH startBoard, relationships(p) as moves
        WHERE all(m in moves WHERE m.numGames > 300) AND moves[-1].blackPercentage > 90
        RETURN reduce(sans = split(startBoard.san, " "), m IN moves | sans + m.moveSan) as line;
    `);

    const sans = results.records.map((record) => record.get('line'));

    console.log('results:');
    console.log(sans);

    await session.close();

    await handleSaveResults(sans);
}
