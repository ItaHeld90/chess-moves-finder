import { partition, groupBy, chunk } from 'lodash';

export type Structure = {
    [key: string]: Structure | string;
};

interface StructureOptions {
    consolidateLinearLines: boolean;
}

export const terminatedKey = 'terminated';

export function wait(millis: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, millis);
    });
}

export function percentage(num: number): number {
    return Number((num * 100).toFixed(2));
}

export function addGetter<T extends Object, K extends keyof T>(obj: T, getterKey: K, getter: () => T[K]): T {
    return Object.defineProperty(obj, getterKey, { get: getter });
}

export function structure(
    arrays: string[][],
    { consolidateLinearLines }: StructureOptions = { consolidateLinearLines: true }
): Structure {
    return recurse(arrays, 0, []);

    function recurse(arrays: string[][], arrIdx: number, seq: string[]): Structure {
        const [[terminatedArray], nonTerminatedArrays] = partition(arrays, (arr) => arrIdx > arr.length - 1);
        const groupedByFirst = groupBy(nonTerminatedArrays, (arr) => arr[arrIdx]);

        const groupKeys = Object.keys(groupedByFirst);
        const isSingleGroup = groupKeys.length === 1;
        const shouldContinueSeq = consolidateLinearLines ? isSingleGroup : isSingleGroup && !terminatedArray.length;

        if (shouldContinueSeq) {
            const nextArrays = Object.values(groupedByFirst)[0];
            return recurse(nextArrays, arrIdx + 1, [...seq, groupKeys[0]]);
        }

        const subStructures = Object.entries(groupedByFirst).map(([key, group]) => {
            return recurse(group, arrIdx + 1, [key]);
        });

        const terminatedObj = terminatedArray ? { [terminatedKey]: terminatedArray.join(' ') } : {};
        const mergedSubStructres = subStructures.reduce((res, sub) => ({ ...res, ...sub }), terminatedObj as Structure);

        return seq.length
            ? {
                  [seq.join(' ')]: mergedSubStructres,
              }
            : mergedSubStructres;
    }
}

export function sansPathToPGN(sansPath: string[]): string {
    const pgn = chunk(sansPath, 2)
        .reduce((res, movesPair, idx) => {
            const moveText = `${idx + 1}. ${movesPair.join(' ')}`;
            return `${res} ${moveText}`;
        }, '')
        .trim();

    return pgn;
}
