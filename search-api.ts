import { compact } from 'lodash';
import { runner } from './crawl';
import { sansPathToPGN } from './helper-utils';
import { staffordGambitPath } from './openings';
import { handleSaveResults } from './save-results';
import { RunnerParams } from './types';

searchApi();

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
