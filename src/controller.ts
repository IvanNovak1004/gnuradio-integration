'use strict';

import * as vscode from 'vscode';
import { dirname, extname, basename, resolve } from 'path';
import { existsSync } from 'fs';
import { PythonShell } from 'python-shell';
import * as modtool from './modtool';

export class GNURadioController {
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
                this.execModtool('update', '--complete');
                vscode.commands.executeCommand('setContext', xmlFoundContextKey, false);
                updateAll = await vscode.window.showInformationMessage('Block definitions written to "grc/".', dontShowAgain);
            }
            if (updateAll === dontShowAgain) {
                vscode.workspace.getConfiguration(this.extId).update('checkXml', false, vscode.ConfigurationTarget.Global);
            }
        }
    }

    private grc() {
        return vscode.workspace.getConfiguration(this.extId)
            .get<string>('companion.cmd') ?? 'gnuradio-companion';
    }

    private grcc() {
        return vscode.workspace.getConfiguration(this.extId)
            .get<string>('compiler.cmd') ?? 'grcc';
    }

    private print(value: string) {
        this._outputChannel.appendLine(value);
    }

    private exec(cmd: string, cwd?: string) {
        vscode.tasks.executeTask(new vscode.Task(
            {
                type: 'shell',
                options: { cwd: cwd ?? this.cwd }
            },
            vscode.TaskScope.Workspace,
            'gnuradio-companion: edit file',
            'shell',
            new vscode.ShellExecution(cmd)
        ));
    }

    private async execOnFile(cmd: string, fileUri?: vscode.Uri, fileExtension?: string | undefined) {
        try {
            if (fileUri === undefined) {
                throw Error("File required");
            }
            let stat = await vscode.workspace.fs.stat(fileUri);
            switch (stat.type) {
                case vscode.FileType.File:
                    break;
                case vscode.FileType.Directory:
                    throw Error("File required, but folder was provided");
                case vscode.FileType.SymbolicLink:
                    throw Error("File required, but symlink was provided");
                default:
                    throw Error("File required, but something else was provided");
            }
            let path = fileUri.fsPath;
            if (fileExtension && extname(path) !== fileExtension) {
                throw Error(`Expected file extension "${fileExtension}", but found "${extname(path)}"`);
            }
            this.exec(`${cmd} "${path}"`, dirname(path));
            return true;
        } catch (err) {
            if (err instanceof Error) {
                vscode.window.showErrorMessage(err.message);
            }
        }
    }

    private async execModtool(command: 'add' | 'bind' | 'disable' | 'info' | 'makeyaml' | 'rename' | 'rm' | 'update', ...args: string[]): Promise<string[]> {
        this.print(`[Running] gr_modtool ${command} ${args.join(' ')}`);
        const output: string[] = await PythonShell.run(`${command}.py`, {
            scriptPath: resolve(this.context.extensionPath, 'src', 'modtool'),
            mode: 'text', encoding: 'utf8',
            stderrParser: data => this.print(data),
            cwd: this.cwd, args,
        });
        for (const line of output) {
            this.print(line);
        }
        this.print('');
        return output;
    }

    /** 
     * Open GNURadio Companion application.
     * 
     * This command runs `gnuradio-companion` in the shell.
     */
    public async openGnuradioCompanion() {
        this.exec(`"${this.grc()}"`);
    }

    /** 
     * Edit the file in GNURadio Companion application.
     * 
     * This command runs `gnuradio-companion %f` in the shell, opening the selected file `%f`.
     */
    public async editInGnuradioCompanion(fileUri?: vscode.Uri) {
        await this.execOnFile(`"${this.grc()}"`, fileUri, '.grc');
    }

    /**
     * Compile the GRC flowgraph file.
     * 
     * This command runs `grcc %f` in the shell, producing a Python executable in the same folder as the selected file `%f`.
     */
    public async compileFlowgraph(fileUri?: vscode.Uri) {
        if (await this.execOnFile(`"${this.grcc()}"`, fileUri, '.grc')) {
            // TODO: C++ flowgraph?
            vscode.window.showInformationMessage(`Compiled to "${fileUri?.fsPath.replace(/".grc$"/, ".py")}" successfully`);
        }
    }

    /**
     * Run the GRC flowgraph file.
     * 
     * This command runs `grcc -r %f` in the shell, producing a Python executable in the same folder as the selected file `%f` and running it.
     */
    public async runFlowgraph(fileUri?: vscode.Uri) {
        await this.execOnFile(`"${this.grcc()}" -r`, fileUri, '.grc');
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
            this.print(`[Running] gr_modtool newmod ${newmodName}`);
            const output: string[] = await PythonShell.run('newmod.py', {
                scriptPath: resolve(this.context.extensionPath, 'src', 'modtool'),
                mode: 'text', encoding: 'utf8',
                stderrParser: data => this.print(data),
                cwd: parentDir,
                args: [newmodName],
            });
            for (const line of output) {
                this.print(line);
            }
            this.print('');
            if (await vscode.window.showInformationMessage(`New GNURadio module "${newmodName}" created in ${newmodPath}.`, 'Open Directory') === 'Open Directory') {
                vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(newmodPath));
            }
        } catch (err) {
            if (err instanceof Error) {
                vscode.window.showErrorMessage(err.message);
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
            const moduleInfoStr = await this.execModtool('info');
            return JSON.parse(moduleInfoStr.join('\n').trim().replace(/\'/g, '"'));
        } catch (err) {
            if (err instanceof Error) {
                vscode.window.showErrorMessage(err.message);
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
            let args = [
                state.name!,
                '--block-type',
                state.blockType!.label,
                '--lang',
                state.language!.description!,
            ];
            if (state.copyright) {
                args.push('--copyright', state.copyright);
            }
            if (state.addCppTest) {
                args.push('--add-cpp-qa');
            }
            if (state.addPythonTest) {
                args.push('--add-python-qa');
            }
            this.execModtool('add', ...args);
            const blockPath = state.language!.description === 'python'
                ? resolve(this.cwd!, 'python', this.moduleName!, `${state.name}.py`)
                : resolve(this.cwd!, 'include', 'gnuradio', this.moduleName!, `${state.name}.h`);
            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(blockPath));
        } catch (err) {
            if (err instanceof Error) {
                vscode.window.showErrorMessage(err.message);
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
            } else if (!modtool.filterCppBlocks(fileUri.fsPath)) {
                throw Error(`Invalid file type: expected a header (.h), found ${basename(fileUri.fsPath)}`);
            } else {
                blockName = modtool.mapCppBlocks(fileUri.fsPath);
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            this.execModtool('bind', blockName);
            vscode.window.showInformationMessage(`Python bindings written to "python/${this.moduleName!}/bindings/${blockName}_python.cc"`);
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
                this.execModtool('disable', blockName);
                vscode.window.showInformationMessage(`Block "${blockName}" was disabled`);
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
                this.execModtool('rm', blockName);
                vscode.window.showInformationMessage(`Block "${blockName}" was removed`);
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
            this.execModtool('rename', blockName);
            vscode.window.showInformationMessage(`Block "${blockName}" was renamed to "${newBlockName}"`);
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
                const xmlBlocks = modtool.getGrcBlocks(this.cwd!, this.moduleName!, '.xml');
                if (xmlBlocks.length === 0) {
                    return vscode.window.showInformationMessage('No XML found, no need to update!');
                }
                blockName = await vscode.window.showQuickPick(xmlBlocks, {
                    title: 'GNURadio: Convert XML to YAML',
                    placeHolder: 'Enter block name...',
                    canPickMany: false,
                });
            } else if (!modtool.filterGrcBlocks('.xml')(fileUri.fsPath)) {
                throw Error(`Invalid file type: expected XML, found ${extname(fileUri.fsPath)}`);
            } else {
                blockName = modtool.mapGrcBlocks('.xml')(fileUri.fsPath);
            }
            if (!blockName) {
                const updateAll = await vscode.window.showWarningMessage('No block name provided! Update all definitions?', 'Yes', 'No');
                if (updateAll === 'Yes') {
                    this.execModtool('update', '--complete');
                    vscode.window.showInformationMessage(`Block definitions written to "grc/"`);
                }
                return;
            }
            this.execModtool('update', blockName);
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
            this.execModtool('makeyaml', blockName);
            vscode.window.showInformationMessage(`Block definition written to "grc/${this.moduleName!}_${blockName}.block.yml"`);
        } catch (err) {
            if (err instanceof Error) {
                vscode.window.showErrorMessage(err.message);
            }
        }
    }
}
