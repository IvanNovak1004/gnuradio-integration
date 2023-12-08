'use strict';

import * as vscode from 'vscode';
import { promisify } from 'util';
import { ExecOptions, exec as cp_exec } from 'child_process';
import { dirname, extname, basename, resolve } from 'path';
import { existsSync } from 'fs';
import * as modtool from './modtool';
const exec = promisify(cp_exec);

export class GNURadioController implements vscode.TreeDataProvider<vscode.TreeItem> {
    private context: vscode.ExtensionContext;
    private _outputChannel: vscode.OutputChannel;
    private cwd?: string;
    private moduleName?: string;
    public readonly extId: string;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this._outputChannel = vscode.window.createOutputChannel(context.extension.packageJSON.displayName);
        this.extId = context.extension.packageJSON.name;
    }

    /**
     * Set the current working directory and detect the module.
     */
    public async setCwd(cwd?: string) {
        this.cwd = cwd;
        this.moduleName = undefined;
        let moduleFound = false;
        const info = await this.getModuleInfo();
        if (info) {
            moduleFound = true;
            this.moduleName = info['modname'];
            // TODO: base_dir !== this.cwd
            if (vscode.workspace.getConfiguration(this.extId).get('modtool.checkXml') === true) {
                this.checkXml();
            }
        }
        vscode.commands.executeCommand('setContext', `${this.extId}.moduleFound`, moduleFound);
    }

    /**
     * Check for old XML block definitions in the OOT module.
     * 
     * If any are found, asks if the user wants to update them to YAML.
     */
    public async checkXml() {
        const xmlFoundContextKey = `${this.extId}.xmlFound`;
        if (!this.cwd) {
            vscode.commands.executeCommand('setContext', xmlFoundContextKey, false);
            return;
        }
        const xmlBlocks = modtool.getGrcBlocks(this.cwd!, this.moduleName!, '.xml');
        vscode.commands.executeCommand('setContext', xmlFoundContextKey, xmlBlocks.length > 0);
        if (xmlBlocks.length > 0) {
            const yes = vscode.l10n.t("Yes"), no = vscode.l10n.t("No"), dontShowAgain = vscode.l10n.t("Don't Show Again");
            let updateAll = await vscode.window.showInformationMessage('XML block definitions found. Update them to YAML?', yes, no, dontShowAgain);
            if (updateAll === 'Yes') {
                await this.exec(`${this.modtool()} update --complete`);
                vscode.commands.executeCommand('setContext', xmlFoundContextKey, false);
                updateAll = await vscode.window.showInformationMessage('Block definitions written to "grc/".', dontShowAgain);
            }
            if (updateAll === dontShowAgain) {
                vscode.workspace.getConfiguration(this.extId).update('checkXml', false, vscode.ConfigurationTarget.Global);
            }
        }
    }

    private grc() {
        return vscode.workspace.getConfiguration(this.extId).get('companion.cmd');
    }

    private grcc() {
        return vscode.workspace.getConfiguration(this.extId).get('compiler.cmd');
    }

    private modtool() {
        return vscode.workspace.getConfiguration(this.extId).get('modtool.cmd');
    }

    private print(value: string) {
        this._outputChannel.appendLine(value);
    }

    private exec(cmd: string, options: ExecOptions & {
        successMessage?: string | undefined,
        stdoutPath?: string | undefined,
    } = {}) {
        if (!options.cwd) {
            options.cwd = this.cwd;
        }
        //this._outputChannel.show(true);
        this.print(`[Running] ${cmd}`);
        const proc = exec(cmd, options);
        proc.child.stdout?.on('data', (data) => this.print(`${data}`));
        proc.child.stderr?.on('data', (data) => this.print(`${data}`));
        if (options.successMessage) {
            proc.child.on('close', () => {
                this.print(`[Done] ${options.successMessage}`);
                vscode.window.showInformationMessage(options.successMessage!);
            });
        }
        proc.child.on('error', (err) => {
            this.print(`[Error] ${proc.child.stderr?.toString()}`);
            vscode.window.showErrorMessage(err.toString());
        });
        return proc;
    }

    private async execOnFile(cmd: string, fileUri?: vscode.Uri, options: ExecOptions & {
        successMessage?: string | undefined,
        stdoutPath?: string | undefined,
        fileExtension?: string | undefined,
    } = {}) {
        if (fileUri === undefined) {
            return vscode.window.showErrorMessage("File required");
        }
        let stat = await vscode.workspace.fs.stat(fileUri);
        switch (stat.type) {
            case vscode.FileType.File:
                break;
            case vscode.FileType.Directory:
                return vscode.window.showErrorMessage("File required, but folder was provided");
            case vscode.FileType.SymbolicLink:
                return vscode.window.showErrorMessage("File required, but symlink was provided");
            default:
                throw Error("File required, but something else was provided");
        }
        let path = fileUri.fsPath;
        if (options.fileExtension && extname(path) !== options.fileExtension) {
            // FIXME: Is this a sanity check?
            return vscode.window.showErrorMessage(`Expected file extension "${options.fileExtension}", but found "${extname(path)}"`);
        }
        if (!options.cwd) {
            options.cwd = dirname(path);
        }
        return this.exec(`${cmd} "${path}"`, options);
    }

    /** 
     * Open GNURadio Companion application.
     * 
     * This command runs `gnuradio-companion` in the shell.
     */
    public async openGnuradioCompanion() {
        return this.exec(`"${this.grc()}"`);
    }

    /** 
     * Edit the file in GNURadio Companion application.
     * 
     * This command runs `gnuradio-companion %f` in the shell, opening the selected file `%f`.
     */
    public async editInGnuradioCompanion(fileUri?: vscode.Uri) {
        return this.execOnFile(`"${this.grc()}"`, fileUri, { fileExtension: '.grc' });
    }

    /**
     * Compile the GRC flowgraph file.
     * 
     * This command runs `grcc %f` in the shell, producing a Python executable in the same folder as the selected file `%f`.
     */
    public async compileFlowgraph(fileUri?: vscode.Uri) {
        return this.execOnFile(`"${this.grcc()}"`, fileUri, { fileExtension: '.grc' });
    }

    /**
     * Run the GRC flowgraph file.
     * 
     * This command runs `grcc -r %f` in the shell, producing a Python executable in the same folder as the selected file `%f` and running it.
     */
    public async runFlowgraph(fileUri?: vscode.Uri) {
        return this.execOnFile(`"${this.grcc()}" -r`, fileUri, {
            successMessage: `Compiled to "${fileUri?.fsPath.replace(/".grc$"/, ".py")}" successfully`,
            fileExtension: '.grc',
        });
    }

    /**
     * Create a new OOT module project.
     * 
     * This command runs `gr_modtool newmod %name` in the shell, creating a new CMake project and opening the created folder. 
     */
    public async createModule() {
        try {
            const { newmodName, parentDir } = await modtool.createModule();
            const newmodPath = resolve(parentDir, `gr-${newmodName}`);
            if (existsSync(newmodPath)) {
                throw Error('Directory already exists');
            }
            await this.exec(`"${this.modtool()}" newmod ${newmodName}`, { cwd: parentDir });
            return vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(newmodPath));
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    /**
     * Query information about the OOT module.
     * 
     * This command runs `gr_modtool info` in the shell and returns a JSON map.
     */
    public async getModuleInfo() {
        try {
            if (!this.cwd) {
                throw Error("No module detected in the open workspace");
            }
            let { stdout: moduleInfoStr, stderr: _ } = await this.exec(`"${this.modtool()}" info --python-readable`);
            return JSON.parse(moduleInfoStr.slice(0, -1).replace(/\'/g, '"'));
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    /**
     * Create a new block in the OOT module.
     * 
     * This command runs `gr_modtool add` in the shell, creating source files and including them into CMakeLists.
     * 
     * TODO: Create an HTML form instead of a multi-step input box
     */
    public async createBlock() {
        try {
            const existingBlocks = modtool.getAllBlocks(this.cwd!, this.moduleName!);
            const state = await modtool.createBlock(this.context, existingBlocks);
            if (!state) {
                return;
            }
            await this.exec(`"${this.modtool()}" add ${state.name} --copyright ${state.copyright ?? ''} --block-type ${state.blockType!.label} --lang ${state.language!.description} --add-cpp-qa --add-python-qa --argument-list ""`);
            // ${state.addCppTest ?? ''} ${state.addPythonTest ?? ''}
            const blockPath = state.language!.description === 'python'
                ? resolve(this.cwd!, 'python', this.moduleName!, `${state.name}.py`)
                : resolve(this.cwd!, 'include', 'gnuradio', this.moduleName!, `${state.name}.h`);
            return vscode.commands.executeCommand('vscode.open', vscode.Uri.file(blockPath));
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    /**
     * Create Python bindings for the block.
     * 
     * This command runs `gr_modtool bind %f` in the shell, generating pybind11 code based on the block's C++ header.
     */
    public async createPythonBindings(fileUri?: vscode.Uri) {
        try {
            let blockName: string | undefined;
            if (!fileUri) {
                const headers = modtool.getCppBlocks(this.cwd!, this.moduleName!);
                blockName = await vscode.window.showQuickPick(headers, {
                    title: 'GNURadio: Python Bindings',
                    placeHolder: 'Enter block name...',  // TODO: Regular expression (python-bridge?)
                    canPickMany: false,
                });
            } else if (modtool.filterCppBlocks(fileUri.fsPath)) {
                throw Error(`Invalid file type: expected a header (.h), found ${basename(fileUri.fsPath)}`);
            } else {
                blockName = modtool.mapCppBlocks(fileUri.fsPath);
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            await this.exec(`"${this.modtool()}" bind ${blockName}`);
            return vscode.window.showInformationMessage(`Python bindings written to "python/${this.moduleName!}/bindings/${blockName}_python.cc"`);
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
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
    public async disableBlock(blockName?: string) {
        try {
            if (!blockName) {
                const blocks = Array.from(modtool.getAllBlocks(this.cwd!, this.moduleName!));
                blockName = await vscode.window.showQuickPick(blocks, {
                    title: 'GNURadio: Disable Block',
                    placeHolder: 'Enter block name...',
                    canPickMany: false,
                });
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            // TODO: show files to be disabled?
            const confirm = await vscode.window.showWarningMessage(`Are you sure you want to disable "${blockName}"?`, { modal: true }, "Yes");
            if (confirm === 'Yes') {
                await this.exec(`"${this.modtool()}" disable ${blockName}`);
                return vscode.window.showInformationMessage(`Block "${blockName}" was disabled`);
            }
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    /**
     * Remove the block from the OOT module.
     * 
     * This command runs `gr_modtool rm %f`, removing all related files and changing CMakeLists.
     */
    public async removeBlock(blockName?: string) {
        try {
            if (!blockName) {
                const blocks = Array.from(modtool.getAllBlocks(this.cwd!, this.moduleName!));
                blockName = await vscode.window.showQuickPick(blocks, {
                    title: 'GNURadio: Remove Block',
                    placeHolder: 'Enter block name...',
                    canPickMany: false,
                });
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            // TODO: show files to be removed?
            const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove "${blockName}"?`, { modal: true }, "Yes");
            if (confirm === 'Yes') {
                await this.exec(`"${this.modtool()}" rm ${blockName} -y`);
                return vscode.window.showInformationMessage(`Block "${blockName}" was removed`);
            }
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    /**
     * Change the block's name.
     * 
     * This command runs `gr_modtool rename %f`, renaming all related files and changing CMakeLists.
     */
    public async renameBlock(blockName?: string) {
        try {
            if (!blockName) {
                const blocks = Array.from(modtool.getAllBlocks(this.cwd!, this.moduleName!));
                blockName = await vscode.window.showQuickPick(blocks, {
                    title: 'GNURadio: Rename Block',
                    placeHolder: 'Enter block name...',
                    canPickMany: false,
                });
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            const newBlockName = await vscode.window.showInputBox({
                title: `GNURadio: Rename "${blockName}"`,
                placeHolder: 'Enter new block name...',
                validateInput(value) {
                    let name = value.trim();
                    if (!name.length) {
                        return {
                            message: 'Name cannot be empty',
                            severity: vscode.InputBoxValidationSeverity.Error,
                        };
                    }
                    if (!/^([\w,\_]+)$/.test(name)) {
                        return {
                            message: 'Name can only contain ASCII letters, digits and underscores',
                            severity: vscode.InputBoxValidationSeverity.Error,
                        };
                    }
                    if (name.length < 3) {
                        return {
                            message: 'Descriptive names usually contain at least 3 symbols',
                            severity: vscode.InputBoxValidationSeverity.Warning,
                            then: null,
                        };
                    }
                },
            });
            if (!newBlockName) {
                throw Error('No valid name provided');
            }
            // TODO: show files to be renamed?
            await this.exec(`"${this.modtool()}" rename ${blockName} ${newBlockName}`);
            return vscode.window.showInformationMessage(`Block "${blockName}" was renamed to "${newBlockName}"`);
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
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
                const xmlBlocks = modtool.getGrcBlocks(this.cwd!, this.moduleName!, '.xml');
                if (xmlBlocks.length === 0) {
                    return vscode.window.showInformationMessage('No XML found, no need to update!');
                }
                blockName = await vscode.window.showQuickPick(xmlBlocks, {
                    title: 'GNURadio: Convert XML to YAML',
                    placeHolder: 'Enter block name...',
                    canPickMany: false,
                });
            } else if (modtool.filterGrcBlocks('.xml')(fileUri.fsPath)) {
                throw Error(`Invalid file type: expected XML, found ${extname(fileUri.fsPath)}`);
            } else {
                blockName = modtool.mapGrcBlocks('.xml')(fileUri.fsPath);
            }
            if (!blockName) {
                const updateAll = await vscode.window.showWarningMessage('No block name provided! Update all definitions?', 'Yes', 'No');
                if (updateAll === 'Yes') {
                    await this.exec(`${this.modtool()} update --complete`);
                    return vscode.window.showInformationMessage(`Block definitions written to "grc/"`);
                }
                return;
            }
            await this.exec(`"${this.modtool()}" update ${blockName}`);
            return vscode.window.showInformationMessage(`Block definition written to "grc/${this.moduleName!}_${blockName}.block.yml"`);
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
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
            if (!fileUri) {
                const cppBlocks = modtool.getCppBlockImpl(this.cwd!);
                if (cppBlocks.length === 0) {
                    return vscode.window.showInformationMessage('No C++ blocks found');
                }
                blockName = await vscode.window.showQuickPick(cppBlocks, {
                    title: 'GNURadio: Make YAML from implementation',
                    placeHolder: 'Enter block name...',
                    canPickMany: false,
                });
            } else if (!modtool.filterCppBlockImpl(fileUri.fsPath)) {
                throw Error(`Invalid file type: expected C++ source, found ${basename(fileUri.fsPath)}`);
            } else {
                blockName = modtool.mapCppBlockImpl(fileUri.fsPath);
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            await this.exec(`"${this.modtool()}" makeyaml ${blockName}`);
            return vscode.window.showInformationMessage(`Block definition written to "grc/${this.moduleName!}_${blockName}.block.yml"`);
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    public async getTreeItem(element: vscode.TreeItem) {
        return element;
    }

    public async getChildren(element?: vscode.TreeItem) {
        if (!this.cwd) {
            return [];
        }
        if (!this.moduleName) {
            await this.setCwd(this.cwd);
        }
        if (!this.moduleName) {
            vscode.window.showInformationMessage('No GNURadio Module detected in the workspace');
            return [];
        }
        if (element) {
            if (!element.label) {
                element.collapsibleState = vscode.TreeItemCollapsibleState.None;
                return [];
            }
            const baseUri = vscode.Uri.file(this.cwd);
            return await modtool.getBlockFilesTree(element.label.toString(), baseUri, this.moduleName);
        } else {
            return Array.from(modtool.getAllBlocks(this.cwd, this.moduleName))
                .map((name) => {
                    let item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.Collapsed);
                    return item;
                });
        }
    }
}
