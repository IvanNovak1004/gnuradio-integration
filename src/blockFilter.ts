'use strict';

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
    extname(filename) === '.py' && basename(filename) !== '__init__.py' && !basename(filename).startsWith('qa_');
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

export const filterCppBlockImpl = (filename: string) => filename.endsWith('_impl.cc') || filename.endsWith('_impl.cpp') || filename.endsWith('_impl.cxx');
export const mapCppBlockImpl = (filename: string) => extname(filename) === '.cc' ? basename(filename).slice(0, -8) : basename(filename).slice(0, -9);
export function getCppBlockImpl(cwd: string) {
    return readdirSync(resolve(cwd, 'lib'))
        .filter(filterCppBlockImpl)
        .map(mapCppBlockImpl);
}

export function filteredMapBlockFile(blockName: string, moduleName: string) {
    if (filterCppBlockImpl(blockName)) {
        return mapCppBlockImpl(blockName);
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
