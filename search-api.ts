import { compact } from 'lodash';
import { runner } from './crawl';
import { sansPathToPGN } from './helper-utils';
import { friedLiverAttack, knightAttackPath, panovAttackPath, staffordGambitPath } from './openings';
import { handleSaveResults } from './save-results';
import { RunnerParams } from './types';

searchApi();

async function searchApi() {
    const runnerParams: RunnerParams = {
        startingPath: knightAttackPath,
        shouldExpand: ({ numGames, depth }) =>
            numGames > 5000 && depth < 12,
        shouldRecord: ({ numGames, whitePercentage, blackPercentage }) => {
            return numGames > 5000 && [whitePercentage, blackPercentage].some((percentage) => percentage > 90);
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
