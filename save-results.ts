import { chunk, sortBy } from 'lodash';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { sansPathToPGN, structure, Structure, terminatedKey } from './helper-utils';
import { MovesPath } from './types';

// promisified
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// Config

const shouldConsolidateLinearLines = true;
const savePathBase = path.resolve('saved-results');

export async function handleSaveResults(recordedPathsToSave: MovesPath[]) {
    if (!recordedPathsToSave.length) return;

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const ask = question(rl);

    const shouldSaveReplay = await ask('Would you like to save your results? (Y/N) ');
    const shouldSave = shouldSaveReplay.toLowerCase() === 'y';

    if (!shouldSave) return;

    const defaultFolderName = getDefaultFolderName();
    const folderName = (await ask(`folder name: (${defaultFolderName}) `)) || defaultFolderName;

    await saveRecordedPaths(recordedPathsToSave, folderName);
    console.log('results were saved successfully');
    rl.close();
}

const question = (rl: readline.Interface) => (q: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(q, (reply) => {
            resolve(reply);
        });
    });
};

function getDefaultFolderName() {
    const date = new Date();
    const folderName = `${date.getUTCDay()}_${date.getUTCMonth()}_${date.getUTCFullYear()}_${date.getUTCHours()}_${date.getUTCMinutes()}_${date.getUTCSeconds()}`;
    return folderName;
}

async function saveRecordedPaths(recordedPaths: MovesPath[], folderName: string) {
    const folderPath = path.resolve(savePathBase, folderName);

    await mkdir(folderPath, { recursive: true });

    const sans = recordedPaths.map((path) => path.san!);
    const structuredSans = structure(sans, { consolidateLinearLines: shouldConsolidateLinearLines });
    const filteredSans = flattenStructure(structuredSans);
    const sortedSans = sortBy(filteredSans, (san) => san.join(' '));

    console.log('sorted sans:', sortedSans);

    await savePGNSFlat(sortedSans, folderPath);
    await savePGNStudy(sortedSans, folderPath);
    await savePGNsStructured(structuredSans, folderPath);
}

function flattenStructure(structure: Structure): string[][] {
    const terminated = structure[terminatedKey] as string | null;
    const terminatedPaths = terminated ? [terminated.split(' ')] : [];

    const subPaths = Object.entries(structure)
        .filter(([key]) => key !== terminatedKey)
        .flatMap(([, subStructure]) => flattenStructure(subStructure as Structure));

    return [...terminatedPaths, ...subPaths];
}

async function savePGNsStructured(structuredSans: Structure, folderPath: string): Promise<void> {
    const structuredPGNSBasePath = path.resolve(folderPath, 'structured');

    return recurse(structuredSans, structuredPGNSBasePath);

    async function recurse(structure: Structure, folderPath: string) {
        await mkdir(folderPath, { recursive: true });

        const terminated = structure[terminatedKey] as string | null;
        const terminatedPGN = terminated ? sansPathToPGN(terminated.split(' ')) : null;

        if (terminatedPGN) {
            const filePath = path.resolve(folderPath, 'line.pgn');
            await writeFile(filePath, terminatedPGN);
        }

        const subStructureEntries = Object.entries(structure).filter(([key]) => key !== terminatedKey) as [
            string,
            Structure
        ][];

        for (const [key, subStructure] of subStructureEntries) {
            const nextFolderPath = path.resolve(folderPath, key);
            await recurse(subStructure, nextFolderPath);
        }
    }
}

async function savePGNStudy(sans: string[][], folderPath: string) {
    const pgns = sans.map(sansPathToPGN).map((pgn) => `[]\n\n${pgn}`);
    const content = pgns.join('\n\n\n');

    const filePath = path.resolve(folderPath, 'study.pgn');
    await writeFile(filePath, content);
}

async function savePGNSFlat(sans: string[][], folderPath: string) {
    const pgns = sans.map(sansPathToPGN);

    const flatFolderPath = path.resolve(folderPath, 'flat');

    await mkdir(flatFolderPath, { recursive: true });

    return Promise.all(
        pgns.map((pgn, idx) => {
            const filePath = path.resolve(flatFolderPath, `line_${idx + 1}.pgn`);
            return writeFile(filePath, pgn);
        })
    );
}
