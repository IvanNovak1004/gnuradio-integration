import { readdirSync } from "fs";
import { basename, extname, resolve } from "path";

export const filterGrcBlocks = (filename: string) => filename.endsWith('.block.yml');
export function mapGrcBlocks(moduleName: string, extension: string = '.block.yml') {
    return (filename: string) => basename(filename).slice(moduleName.length + 1, -extension.length);
}
export function getGrcBlocks(cwd: string, moduleName: string) {
    return readdirSync(resolve(cwd, 'grc'))
        .filter(filterGrcBlocks)
        .map(mapGrcBlocks(moduleName));
}

export const filterXmlBlocks = (filename: string) => extname(filename) === '.xml';
export function getXmlBlocks(cwd: string, moduleName: string) {
    return readdirSync(resolve(cwd, 'grc'))
        .filter(filterXmlBlocks)
        .map(mapGrcBlocks(moduleName, '.xml'));
}

export const filterCppBlocks = (filename: string) => extname(filename) === '.h' && basename(filename) !== 'api.h';
export const mapCppBlocks = (filename: string) => basename(filename).slice(0, -2);
export function getCppBlocks(cwd: string, moduleName: string) {
    return readdirSync(resolve(cwd, 'include', 'gnuradio', moduleName))
        .filter(filterCppBlocks)
        .map(mapCppBlocks);
}

export const filterPyBlocks = (filename: string) =>
    extname(filename) === '.py' && basename(filename) !== '__init__.py' && !filterBlockTests(filename);
export const mapPyBlocks = (filename: string) => basename(filename).slice(0, -3);
export function getPyBlocks(cwd: string, moduleName: string) {
    return readdirSync(resolve(cwd, 'python', moduleName))
        .filter(filterPyBlocks)
        .map(mapPyBlocks);
}

export function getAllBlocks(cwd: string, moduleName: string) {
    return new Set([
        ...getGrcBlocks(cwd, moduleName),
        ...getCppBlocks(cwd, moduleName),
        ...getPyBlocks(cwd, moduleName),
    ]);
}

export const filterCppImplFiles = (filename: string) => ['.cc', '.cpp', '.cxx'].includes(extname(filename));
export const mapCppImplFiles = (filename: string) => {
    const fname = filename.slice(0, -extname(filename).length);
    return fname.endsWith('_impl') ? fname.slice(0, -5) : fname;
};
export function getCppImplFiles(cwd: string) {
    return readdirSync(resolve(cwd, 'lib'))
        .filter(filterCppImplFiles)
        .map(mapCppImplFiles);
}

export const filterBlockTests = (filename: string) =>
    basename(filename).startsWith('qa_') || basename(filename).startsWith('test_');

export function filteredMapBlockFile(blockName: string, moduleName: string) {
    if (filterCppImplFiles(blockName)) {
        return mapCppImplFiles(blockName);
    } else if (blockName.endsWith('_impl.h')) {
        return basename(blockName).slice(0, -7);
    } else if (filterCppBlocks(blockName)) {
        return mapCppBlocks(blockName);
    } else if (filterPyBlocks(blockName)) {
        return mapPyBlocks(blockName);
    } else if (filterGrcBlocks(blockName)) {
        return mapGrcBlocks(moduleName)(blockName);
    } else {
        return undefined;
    }
}
