'use strict';

import {
    window, workspace,
    Uri, ExtensionContext,
    InputBoxValidationSeverity, QuickPickItem, ThemeIcon
} from 'vscode';
import { readdirSync } from 'fs';
import { basename, extname, resolve } from 'path';
import { MultiStepInput } from './multiStepInput';
import { execSync } from 'child_process';

export async function createModule() {
    const newmodName = await window.showInputBox({
        title: 'GNURadio: New OOT Module',
        placeHolder: 'Enter Module Name...',
        validateInput(value) {
            let name = value.trim();
            if (!name.length) {
                return {
                    message: 'Name cannot be empty',
                    severity: InputBoxValidationSeverity.Error,
                };
            }
            if (!/^([\w,\_,\-,\.]+)$/.test(name)) {
                return {
                    message: 'Name can only contain ASCII letters, digits, and the characters . - _',
                    severity: InputBoxValidationSeverity.Error,
                };
            }
            if (name.length < 3) {
                return {
                    message: 'Descriptive names usually contain at least 3 symbols',
                    severity: InputBoxValidationSeverity.Warning,
                    then: null,
                };
            }
        },
    });
    if (!newmodName) {
        throw Error('No valid name provided');
    }
    const parentDir = await window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Create module in directory'
    }).then(
        (value) => value && value.length ? value[0].fsPath : undefined,
        () => undefined,
    );
    if (!parentDir) {
        throw Error('No directory provided');
    }
    return { newmodName, parentDir };
}

export async function createBlock(context: ExtensionContext, existingBlocks: Set<string>) {
    interface State {
        title: string;
        step: number;
        totalSteps: number;
        copyright?: string;
        name?: string;
        blockType?: QuickPickItem;
        language?: QuickPickItem;
        addCppTest?: string;
        addPythonTest?: string;
        finished: boolean;
    }

    async function inputAuthor(input: MultiStepInput, state: State) {
        // TODO: Remember current value when navigating back.
        state.copyright = await input.showInputBox({
            title: state.title,
            step: 1,
            totalSteps: state.totalSteps,
            value: state.copyright || '',
            prompt: 'Please specify the copyright holder',
        });
        return (input: MultiStepInput) => inputName(input, state);
    }

    async function inputName(input: MultiStepInput, state: State) {
        // TODO: Remember current value when navigating back.
        state.name = await input.showInputBox({
            title: state.title,
            step: 2,
            totalSteps: state.totalSteps,
            value: state.name || '',
            prompt: 'Choose a unique name for the block',
            validateInput(value) {
                let name = value.trim();
                if (!name.length) {
                    return {
                        message: 'Name cannot be empty',
                        severity: InputBoxValidationSeverity.Error,
                    };
                }
                if (!/^([\w,\_]+)$/.test(name)) {
                    return {
                        message: 'Name can only contain ASCII letters, digits and underscores',
                        severity: InputBoxValidationSeverity.Error,
                    };
                }
                if (name.length < 3) {
                    return {
                        message: 'Descriptive names usually contain at least 3 symbols',
                        severity: InputBoxValidationSeverity.Warning,
                        then: null,
                    };
                }
                if (existingBlocks.has(name)) {
                    return {
                        message: 'Block with that name is already present',
                        severity: InputBoxValidationSeverity.Error,
                    };
                }
            },
        });
        return (input: MultiStepInput) => pickBlockType(input, state);
    }

    async function pickBlockType(input: MultiStepInput, state: State) {
        const pick = await input.showQuickPick(
            [
                { label: 'general', description: 'gr::block', detail: 'General-purpose block type' },
                { label: 'sync', description: 'gr::sync_block', detail: 'Block with synchronous 1:1 input-to-output' },
                { label: 'decimator', description: 'gr::sync_decimator', detail: 'Block with synchronous N:1 input-to-output' },
                { label: 'interpolator', description: 'gr::sync_interpolator', detail: 'Block with synchronous N:1 input-to-output' },
                { label: 'source', description: 'gr::sync_block', detail: 'Source block with outputs, but no stream inputs' },
                { label: 'sink', description: 'gr::sync_block', detail: 'Sink block with inputs, but no stream outputs' },
                { label: 'tagged_stream', description: 'gr::tagged_stream_block', detail: 'Block with input-to-output flow controlled by input stream tags (e.g. packetized streams)' },
                { label: 'hier', description: 'gr::hier_block2', detail: 'Hierarchical container block for other blocks; usually can be described by a flowgraph' },
                { label: 'noblock', detail: 'C++ or Python class' },
            ],
            {
                title: state.title,
                step: 3,
                totalSteps: state.totalSteps,
                placeHolder: 'Pick block type',
                activeItem: state.blockType,
            }
        );
        state.blockType = pick[0];
        // state.totalSteps = state.blockType.label === 'noblock' ? 4 : 5;
        return (input: MultiStepInput) => pickLanguage(input, state);
    }

    async function pickLanguage(input: MultiStepInput, state: State) {
        const baseUri = context.extensionUri;
        const pick = await input.showQuickPick(
            [
                {
                    label: 'Python',
                    description: 'python',
                    iconPath: Uri.joinPath(baseUri, 'media', 'file_type_python.svg')
                },
                {
                    label: 'C++',
                    description: 'cpp',
                    iconPath: Uri.joinPath(baseUri, 'media', 'file_type_cpp3.svg')
                },
            ],
            {
                title: state.title,
                step: 4,
                totalSteps: state.totalSteps,
                placeHolder: 'Pick implementation language',
                activeItem: state.language,
            }
        );
        state.language = pick[0];
        // if (state.blockType?.label === 'noblock' && state.language.label.includes('Python')) {
        state.finished = true;
        //     return;
        // }
        // return (input: MultiStepInput) => pickTests(input, state);
    }

    // async function pickTests(input: MultiStepInput, state: State) {
    //     let testLanguages: vscode.QuickPickItem[] = [];
    //     if (state.blockType?.label !== 'noblock') {
    //         testLanguages.push({ label: 'Python', description: 'python' });
    //     }
    //     if (state.language?.label.includes('C++')) {
    //         testLanguages.push({ label: 'C++', description: 'cpp' });
    //     }
    //     const picks = await input.showQuickPick({
    //         title: state.title,
    //         step: 5,
    //         totalSteps: 5,
    //         placeholder: 'Add QA code',
    //         items: testLanguages,
    //         canSelectMany: true,
    //         shouldResume: async () => false,
    //     });
    //     for (var pick of picks) {
    //         if (pick.description === 'cpp') {
    //             state.addCppTest = '--add-cpp-qa';
    //         } else if (pick.description === 'python') {
    //             state.addPythonTest = '--add-python-qa';
    //         }
    //     }
    //     state.finished = true;
    // }

    // TODO: `gr_modtool add` requires --add-cpp-qa and/or --add-python-qa

    // TODO: Arguments?

    let state = <State>{ title: 'GNURadio: Create Block', totalSteps: 4, finished: false };
    try {
        const gitPath = workspace.getConfiguration('git').get<string | string[]>('path');
        const gitCmd = gitPath
            ? Array.isArray(gitPath)
                ? gitPath.length > 0 ? gitPath[0] : undefined
                : gitPath
            : undefined;
        state.copyright = execSync(`${gitCmd ?? 'git'} config user.name`, { encoding: 'utf8' });
    }
    catch (_) { }

    await MultiStepInput.run(input => inputAuthor(input, state));
    return state.finished ? state : undefined;
}

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

export function quickPickWithRegex(items: string[], title?: string, placeholder?: string) {
    return new Promise<string>((resolve) => {
        let blockPick = window.createQuickPick();
        blockPick.title = title;
        blockPick.placeholder = placeholder;
        blockPick.canSelectMany = false;
        blockPick.items = items.map((label) => ({ label }));
        blockPick.onDidChangeValue(() => {
            if (!items.includes(blockPick.value)) {
                let picks: QuickPickItem[] = items.map((label) => ({ label }));
                let regexPick = {
                    label: blockPick.value,
                    description: 'Regular expression',
                    iconPath: new ThemeIcon('filter'),
                };
                if (items.includes(blockPick.value)) {
                    picks.push(regexPick);
                } else {
                    picks.unshift(regexPick);
                }
                blockPick.items = picks;
            }
        });
        blockPick.onDidAccept(() => {
            const selection = blockPick.activeItems[0];
            if (selection.description === 'Regular expression') {
                // TODO: regex syntax
                resolve(`.*${selection.label}.*`);
            } else {
                resolve(selection.label);
            }
            blockPick.hide();
        });
        blockPick.onDidHide(() => blockPick.dispose());
        blockPick.show();
    });
}
