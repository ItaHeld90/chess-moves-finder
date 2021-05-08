import { RunnerParams, MovesPath } from './types';
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

init();

async function init() {
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
    const recordedPathsToSave = recordedPaths.map(({ path }) => path).filter((path) => path.san);
    const pgns = recordedPathsToSave.map((path) => sansPathToPGN(path.san!));

    console.log('results:', pgns);

    handleSaveResults(recordedPathsToSave);
}
