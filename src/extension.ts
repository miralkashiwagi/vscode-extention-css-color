import * as vscode from 'vscode';
import { PugDefinitionProvider } from './definitionProvider';
import { completionProvider } from './completionProvider';
import { createIndentationDiagnostics, updateIndentationDiagnostics } from './indentationDiagnostics';
import { PugPasteProvider } from './pasteProvider';
import { PugPasteHandler } from './pasteProviderOld';
import { activateMixinIndexer } from './mixinIndexer';
import { PugDocumentSymbolProvider, PugWorkspaceSymbolProvider } from './pugSymbolProvider';
import { PugSignatureHelpProvider } from './pugSignatureHelpProvider';
import { pugHoverProvider } from './hoverProvider';

// Global instances for cleanup
let registeredProviders: vscode.Disposable[] = [];

// Pug file detection utility
function isPugFile(document: vscode.TextDocument): boolean {
    return document.fileName.endsWith('.pug');
}



export function activate(context: vscode.ExtensionContext) {


    // Create multiple document filters for better compatibility
    const PUG_FILTERS: vscode.DocumentSelector = [
        { pattern: '**/*.pug', scheme: 'file' },
        { pattern: '**/*.pug', scheme: 'untitled' },
        // Fallback: if any existing pug language is registered, use it
        'pug'
    ];

    // Register providers using multiple document filters for maximum compatibility
    const pugDefinitionProviderInstance = new PugDefinitionProvider();
    registeredProviders.push(vscode.languages.registerDefinitionProvider(PUG_FILTERS, pugDefinitionProviderInstance));

    // Register NEW basic language features
    const documentSymbolProvider = new PugDocumentSymbolProvider();
    registeredProviders.push(vscode.languages.registerDocumentSymbolProvider(PUG_FILTERS, documentSymbolProvider));

    const workspaceSymbolProvider = new PugWorkspaceSymbolProvider();
    registeredProviders.push(vscode.languages.registerWorkspaceSymbolProvider(workspaceSymbolProvider));

    // const documentHighlightProvider = new PugDocumentHighlightProvider();
    // registeredProviders.push(vscode.languages.registerDocumentHighlightProvider(PUG_FILTERS, documentHighlightProvider));

    // const foldingRangeProvider = new PugFoldingRangeProvider();
    // registeredProviders.push(vscode.languages.registerFoldingRangeProvider(PUG_FILTERS, foldingRangeProvider));

    const signatureHelpProvider = new PugSignatureHelpProvider();
    registeredProviders.push(vscode.languages.registerSignatureHelpProvider(PUG_FILTERS, signatureHelpProvider, '(', ','));

    // Register basic providers with multiple filters
    registeredProviders.push(vscode.languages.registerCompletionItemProvider(PUG_FILTERS, completionProvider, ...['.', '#', ' ']));
    registeredProviders.push(vscode.languages.registerHoverProvider(PUG_FILTERS, pugHoverProvider));


    // Register diagnostics
    const diagnostics = createIndentationDiagnostics();
    context.subscriptions.push(diagnostics);
    const updateDiagnostics = (document: vscode.TextDocument) => {
        if (isPugFile(document)) {
            updateIndentationDiagnostics(document, diagnostics);
        }
    };
    
    if (vscode.window.activeTextEditor && isPugFile(vscode.window.activeTextEditor.document)) {
        updateDiagnostics(vscode.window.activeTextEditor.document);
    }
    
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && isPugFile(editor.document)) {
            updateDiagnostics(editor.document);
        }
    }));
    
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        if (isPugFile(event.document)) {
            updateDiagnostics(event.document);
        }
    }));
    
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
        if (isPugFile(doc)) {
            diagnostics.delete(doc.uri);
        }
    }));

    // Register Paste Provider
    const pasteProvider = new PugPasteProvider();
    context.subscriptions.push(vscode.languages.registerDocumentPasteEditProvider(PUG_FILTERS, pasteProvider, {
      pasteMimeTypes: ['text/plain'],
      providedPasteEditKinds: [vscode.DocumentDropOrPasteEditKind.Text]
    }));
    
    // Register Paste Handler
    const pasteHandler = new PugPasteHandler();
    context.subscriptions.push(pasteHandler);

    // Activate Mixin Indexer
    activateMixinIndexer(context);


    // Add all providers to context subscriptions
    context.subscriptions.push(...registeredProviders);
    

    // Log successful activation
    console.log('Pug Support - Advanced extension activated successfully');;
}

export function deactivate() {
    // Dispose all registered providers
    registeredProviders.forEach(provider => provider.dispose());
    registeredProviders = [];
}

