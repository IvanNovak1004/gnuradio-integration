'use strict';

import * as vscode from 'vscode';
import { extname, basename, resolve, join } from 'path';
import { existsSync } from 'fs';
import { PythonShell } from 'python-shell';
import * as modtool from './modtool';
import * as blocks from './blockFilter';
import { getBlockFilesTree } from './moduleTree';

export class GNURadioController {
    private _outputChannel: vscode.OutputChannel;
    public moduleName?: string;
    constructor(
        private readonly extRoot: vscode.Uri,
        displayName: string,
        private cwd?: string,
    ) {
        this._outputChannel = vscode.window.createOutputChannel(displayName);
    }

    public dispose() {
        this._outputChannel.dispose();
    }

    private print(value: string) {
        this._outputChannel.appendLine(value);
    }

    public async execModtool(command: 'add' | 'bind' | 'disable' | 'info' | 'makeyaml' | 'rename' | 'rm' | 'update', ...args: string[]): Promise<string[]> {
        this.print(`[Running] gr_modtool ${command} ${args.join(' ')}`);
        const output: string[] = await PythonShell.run(`${command}.py`, {
            scriptPath: resolve(this.extRoot.fsPath, 'src', 'modtool'),
            mode: 'text', encoding: 'utf8',
            parser: data => { this.print(data); return data; },
            stderrParser: data => { this.print(data); return data; },
            cwd: this.cwd, args,
        });
        this.print('');
        return output;
    }

    /**
     * Create Python bindings for the block.
     * 
     * This command runs `gr_modtool bind %f` in the shell, generating pybind11 code based on the block's C++ header.
     */
    public async createPythonBindings(block?: vscode.Uri | vscode.TreeItem) {
        try {
            let blockName: string | undefined;
            const existingBlocks = blocks.getCppBlocks(this.cwd!, this.moduleName!);
            if (block instanceof vscode.TreeItem) {
                blockName = typeof block.label === 'object'
                    ? block.label.label
                    : block.label;
                if (!blockName) {
                    // TODO: Sanity check?
                    return;
                }
            } else if (block instanceof vscode.Uri) {
                if (!blocks.filterCppBlocks(block.fsPath)) {
                    throw Error(`Invalid file type: expected a header (.h), found ${basename(block.fsPath)}`);
                }
                blockName = blocks.mapCppBlocks(block.fsPath);
            } else {
                blockName = vscode.window.activeTextEditor?.document.fileName;
                if (blockName) {
                    blockName = blocks.mapCppBlocks(blockName);
                    if (!existingBlocks.includes(blockName)) {
                        blockName = undefined;
                    }
                }
                blockName = await modtool.quickPickWithRegex(
                    existingBlocks, {
                    title: 'GNURadio: Python Bindings',
                    placeholder: 'Enter block name or regular expression...',
                    value: blockName,
                });
                if (!blockName) {
                    return;
                }
            }
            let successMessage: string;
            if (existingBlocks.includes(blockName)) {
                const blockBindPath = join('python', this.moduleName!, 'bindings', `${blockName}_python.cc`);
                successMessage = `Python bindings written to "${blockBindPath}"`;
            } else {
                const re = RegExp(blockName);
                const matchingBlocks = existingBlocks.filter(block => re.test(block));
                successMessage = 'Python bindings created for blocks: ', matchingBlocks.join(', ');
            }
            await this.execModtool('bind', blockName);
            // TODO: check for failed conversions
            vscode.window.showInformationMessage(successMessage);
        } catch (err) {
            if (err instanceof Error) {
                vscode.window.showErrorMessage(err.message);
            }
        }
    }

    /**
     * Disable the block.
     * 
     * This command runs `gr_modtool disable %f`, commenting out all related lines in CMakeLists.
     * 
     * TODO: `gr_modtool disable` does not work correctly.
     */
    public async disableBlock(block?: vscode.TreeItem) {
        try {
            let blockName = block?.label;
            const existingBlocks = blocks.getAllBlocks(this.cwd!, this.moduleName!);
            if (!blockName) {
                blockName = vscode.window.activeTextEditor?.document.fileName;
                if (blockName) {
                    blockName = blocks.filteredMapBlockFile(blockName, this.moduleName!);
                }
                blockName = await modtool.quickPickWithRegex(
                    Array.from(existingBlocks), {
                    title: 'GNURadio: Disable Blocks',
                    placeholder: 'Enter block name or regular expression...',
                    value: blockName,
                });
                if (!blockName) {
                    return;
                }
            } else if (typeof blockName === 'object') {
                blockName = blockName.label;
            }
            let warningMessage: string;
            let successMessage: string;
            let detailMessage: string[] = [];
            if (existingBlocks.has(blockName)) {
                warningMessage = `Are you sure you want to disable "${blockName}"?`;
                successMessage = `Block "${blockName}" was disabled`;
            } else {
                warningMessage = 'Are you sure you want to disable multiple blocks?';
                const re = RegExp(blockName);
                existingBlocks.forEach(block => {
                    if (re.test(block)) {
                        detailMessage.push(`"${block}"`);
                    }
                });
                successMessage = 'Matching blocks were disabled: ', detailMessage.join(', ');
                detailMessage.unshift('The following blocks will be disabled:');
            }
            const confirm = await vscode.window.showWarningMessage(
                warningMessage, { detail: detailMessage.join('\n- '), modal: true }, 'Yes');
            if (confirm === 'Yes') {
                await this.execModtool('disable', blockName);
                vscode.window.showInformationMessage(successMessage);
            }
        } catch (err) {
            if (err instanceof Error) {
                vscode.window.showErrorMessage(err.message);
            }
        }
    }

    /**
     * Remove the block from the OOT module.
     * 
     * This command runs `gr_modtool rm %f`, removing all related files and changing CMakeLists.
     */
    public async removeBlock(block?: vscode.TreeItem) {
        try {
            let blockName = block?.label;
            const existingBlocks = blocks.getAllBlocks(this.cwd!, this.moduleName!);
            if (!blockName) {
                blockName = vscode.window.activeTextEditor?.document.fileName;
                if (blockName) {
                    blockName = blocks.filteredMapBlockFile(blockName, this.moduleName!);
                }
                blockName = await modtool.quickPickWithRegex(
                    Array.from(existingBlocks), {
                    title: 'GNURadio: Remove Blocks',
                    placeholder: 'Enter block name or regular expression...',
                    value: blockName,
                });
                if (!blockName) {
                    return;
                }
            } else if (typeof blockName === 'object') {
                blockName = blockName.label;
            }
            let warningMessage: string;
            let successMessage: string;
            let detailMessage: string[] = [];
            if (existingBlocks.has(blockName)) {
                warningMessage = `Are you sure you want to remove "${blockName}"?`;
                successMessage = `Block "${blockName}" was removed`;
                detailMessage = (await getBlockFilesTree(blockName, vscode.Uri.file(this.cwd!), this.moduleName!))
                    .map(item => item.resourceUri!.fsPath.slice(this.cwd!.length + 1));
                detailMessage.unshift('The following files will be deleted:');
            } else {
                warningMessage = `Are you sure you want to remove multiple blocks?`;
                const re = RegExp(blockName);
                existingBlocks.forEach(block => {
                    if (re.test(block)) {
                        detailMessage.push(`"${block}"`);
                    }
                });
                successMessage = 'Matching blocks were removed: ' + detailMessage.join(', ');
                detailMessage.unshift('The following blocks will be removed:');
            }
            const confirm = await vscode.window.showWarningMessage(
                warningMessage, { detail: detailMessage.join('\n- '), modal: true }, 'Yes');
            if (confirm === 'Yes') {
                await this.execModtool('rm', blockName);
                vscode.window.showInformationMessage(successMessage);
            }
        } catch (err) {
            if (err instanceof Error) {
                vscode.window.showErrorMessage(err.message);
            }
        }
    }

    /**
     * Change the block's name.
     * 
     * This command runs `gr_modtool rename %f`, renaming all related files and changing CMakeLists.
     */
    public async renameBlock(block?: vscode.TreeItem) {
        try {
            const existingBlocks = blocks.getAllBlocks(this.cwd!, this.moduleName!);
            let blockName = block?.label;
            if (!blockName) {
                const existingBlocks = Array.from(blocks.getAllBlocks(this.cwd!, this.moduleName!));
                blockName = vscode.window.activeTextEditor?.document.fileName;
                if (blockName) {
                    blockName = blocks.filteredMapBlockFile(blockName, this.moduleName!);
                }
                blockName = await modtool.quickPick(
                    existingBlocks, {
                    title: 'GNURadio: Rename Block',
                    placeholder: 'Enter block name...',
                    value: blockName,
                });
                if (!blockName) {
                    return;
                }
            } else if (typeof blockName === 'object') {
                blockName = blockName.label;
            }
            const newBlockName = await vscode.window.showInputBox({
                title: `GNURadio: Rename "${blockName}"`,
                placeHolder: 'Enter new block name...',
                validateInput: modtool.validateBlockName(existingBlocks),
            });
            if (!newBlockName) {
                return;
            }
            let blockFiles = (await getBlockFilesTree(blockName, vscode.Uri.file(this.cwd!), this.moduleName!))
                .map(item => item.resourceUri!.fsPath.slice(this.cwd!.length + 1));
            blockFiles.unshift('The following files will be renamed:');
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to rename "${blockName}" to "${newBlockName}"?`,
                { detail: blockFiles.join('\n- '), modal: true },
                'Yes');
            if (confirm === 'Yes') {
                await this.execModtool('rename', blockName, newBlockName);
                vscode.window.showInformationMessage(`Block "${blockName}" was renamed to "${newBlockName}"`);
            }
        } catch (err) {
            if (err instanceof Error) {
                vscode.window.showErrorMessage(err.message);
            }
        }
    }

    /**
     * Convert old XML block definitions to YAML.
     * 
     * This command runs `gr_modtool update %f`, generating a new YAML definition and deleting the old XML.
     */
    public async convertXmlToYaml(fileUri?: vscode.Uri) {
        try {
            let blockName: string | undefined;
            if (!fileUri) {
                const xmlBlocks = blocks.getXmlBlocks(this.cwd!, this.moduleName!);
                if (xmlBlocks.length === 0) {
                    return vscode.window.showInformationMessage('No XML found, no need to update!');
                }
                blockName = vscode.window.activeTextEditor?.document.fileName;
                if (blockName) {
                    blockName = blocks.mapGrcBlocks(this.moduleName!, '.xml')(blockName);
                    if (!xmlBlocks.includes(blockName)) {
                        blockName = undefined;
                    }
                }
                blockName = await modtool.quickPick(
                    xmlBlocks, {
                    title: 'GNURadio: Convert XML to YAML',
                    placeholder: 'Enter block name...',
                    value: blockName,
                });
            } else if (!blocks.filterXmlBlocks(fileUri.fsPath)) {
                throw Error(`Invalid file type: expected XML, found ${extname(fileUri.fsPath)}`);
            } else {
                blockName = blocks.mapGrcBlocks('.xml')(fileUri.fsPath);
            }
            if (!blockName) {
                const updateAll = await vscode.window.showWarningMessage('No block name provided! Update all definitions?', 'Yes', 'No');
                if (updateAll === 'Yes') {
                    await this.execModtool('update', '--complete');
                    vscode.window.showInformationMessage(`Block definitions written to "grc/"`);
                }
                return;
            }
            await this.execModtool('update', blockName);
            vscode.window.showInformationMessage(`Block definition written to "grc/${this.moduleName!}_${blockName}.block.yml"`);
        } catch (err) {
            if (err instanceof Error) {
                vscode.window.showErrorMessage(err.message);
            }
        }
    }

    /**
     * Make YAML definition the block implementation.
     * 
     * This command runs `gr_modtool makeyaml %f`, generating a YAML definition based on the block's implementation.
     * 
     * TODO: `gr_modtool makeyaml` does not work correctly.
     */
    public async makeYamlFromImpl(fileUri?: vscode.Uri) {
        try {
            let blockName: string | undefined;
            let blockYamlPath = 'grc';
            if (!fileUri) {
                const cppBlocks = blocks.getCppBlockImpl(this.cwd!);
                if (cppBlocks.length === 0) {
                    return vscode.window.showInformationMessage('No C++ blocks found');
                }
                blockName = vscode.window.activeTextEditor?.document.fileName;
                if (blockName) {
                    blockName = blocks.mapCppBlockImpl(blockName);
                    if (!cppBlocks.includes(blockName)) {
                        blockName = undefined;
                    }
                }
                blockName = await modtool.quickPickWithRegex(
                    cppBlocks, {
                    title: 'GNURadio: Make YAML from implementation',
                    placeholder: 'Enter block name or regular expression...',
                    value: blockName,
                });
                if (cppBlocks.includes(blockName)) {
                    blockYamlPath = join('grc', `${this.moduleName!}_${blockName}.block.yml`);
                }
            } else if (!blocks.filterCppBlockImpl(fileUri.fsPath)) {
                throw Error(`Invalid file type: expected C++ source, found ${basename(fileUri.fsPath)}`);
            } else {
                blockName = blocks.mapCppBlockImpl(fileUri.fsPath);
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            await this.execModtool('makeyaml', blockName);
            vscode.window.showInformationMessage(`Block definition written to "${blockYamlPath}"`);
        } catch (err) {
            if (err instanceof Error) {
                vscode.window.showErrorMessage(err.message);
            }
        }
    }
}
