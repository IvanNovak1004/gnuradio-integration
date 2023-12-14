'use strict';

import {
    window, workspace, Uri, FileType, EventEmitter,
    TreeDataProvider, TreeView, TreeItem, TreeItemCollapsibleState,
} from 'vscode';
import * as blocks from './blockFilter';
import { extname } from 'path';

export class GNURadioModuleTreeDataProvider implements TreeDataProvider<TreeItem> {
    public readonly treeView: TreeView<TreeItem>;

    constructor(
        private cwd: string,
        private moduleName: string,
    ) {
        this.treeView = window.createTreeView(
            'gnuradioModule', {
            treeDataProvider: this,
            showCollapseAll: true,
            canSelectMany: false,
        });
    }

    public dispose() {
        this.treeView.dispose();
    }

    private _onDidChangeTreeData = new EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    public refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem) {
        return element;
    }

    async getChildren(element?: TreeItem) {
        if (element) {
            if (!element.label) {
                element.collapsibleState = TreeItemCollapsibleState.None;
                return [];
            }
            return await getBlockFilesTree(element.label.toString(), Uri.file(this.cwd), this.moduleName);
        } else {
            const cppBlocks = blocks.getCppBlocks(this.cwd, this.moduleName);
            const xmlBlocks = blocks.getXmlBlocks(this.cwd, this.moduleName);
            return Array.from(blocks.getAllBlocks(this.cwd, this.moduleName))
                .map((name) => {
                    let item = new TreeItem(name, TreeItemCollapsibleState.Collapsed);
                    item.contextValue = 'block';
                    if (cppBlocks.includes(name)) {
                        item.contextValue += '.cpp';
                    }
                    if (xmlBlocks.includes(name)) {
                        item.contextValue += '.xml';
                    }
                    return item;
                });
        }
    }
}

export async function getBlockFilesTree(block: string, baseUri: Uri, moduleName: string) {
    const readdir = (...pathSegments: string[]) =>
        workspace.fs.readDirectory(Uri.joinPath(baseUri, ...pathSegments));

    function mapBlockToTreeItem(label: string, pathSegments: string[]) {
        return ([name, fileType]: [string, FileType]) => {
            if (fileType !== FileType.File) {
                // Sanity check
                throw Error('Expected a file, got something else');
            }
            let item = new TreeItem(Uri.joinPath(baseUri, ...pathSegments, name));
            item.description = true;
            item.label = label;
            item.command = {
                title: 'open',
                command: 'vscode.open',
                arguments: [item.resourceUri!]
            };
            return item;
        };
    }

    const grcFiles = (await readdir('grc'))
        .filter((value) =>
            value[0].startsWith(`${moduleName}_${block}`) &&
            (blocks.filterGrcBlocks(value[0]) || blocks.filterXmlBlocks(value[0])))
        .map(mapBlockToTreeItem('Block definition', ['grc']));

    const cppFiles = (await readdir('include', 'gnuradio', moduleName))
        .filter((value) =>
            value[0].startsWith(block) &&
            blocks.filterCppBlocks(value[0]))
        .map(mapBlockToTreeItem('Public header', ['include', 'gnuradio', moduleName]));

    const pyFiles = (await readdir('python', moduleName))
        .filter((value) =>
            value[0].startsWith(block) &&
            blocks.filterPyBlocks(value[0]))
        .map(mapBlockToTreeItem('Implementation', ['python', moduleName]));

    const cppImplFiles = (await readdir('lib'))
        .filter((value) =>
            value[0].startsWith(block) &&
            (blocks.filterCppBlockImpl(value[0]) || extname(value[0]) === '.h'))
        .map((value) => {
            let item = mapBlockToTreeItem('Implementation', ['lib'])(value);
            item.label += extname(value[0]) === '.h' ? ' header' : ' source';
            return item;
        });

    return [...grcFiles, ...pyFiles, ...cppFiles, ...cppImplFiles];
}

