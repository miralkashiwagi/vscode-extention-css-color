import * as vscode from 'vscode';
import { ColorChipManagerImpl } from './colorChipManager';

// Global instance of the color chip manager
let colorChipManager: ColorChipManagerImpl;

/**
 * This method is called when your extension is activated
 * Your extension is activated the very first time the command is executed
 */
export function activate(context: vscode.ExtensionContext) {
	try {
		// Initialize the color chip manager
		colorChipManager = new ColorChipManagerImpl();
		
		// Activate the color chip manager
		colorChipManager.activate(context);
		
		// Log successful activation
		console.log('CSS Variable Color Chips extension activated successfully');
		
	} catch (error) {
		console.error('Failed to activate CSS Variable Color Chips extension:', error);
		vscode.window.showErrorMessage(
			'Failed to activate CSS Variable Color Chips extension. Please check the console for details.'
		);
	}
}

/**
 * This method is called when your extension is deactivated
 */
export function deactivate() {
	try {
		if (colorChipManager) {
			colorChipManager.deactivate();
			colorChipManager = undefined as any;
		}
		
		console.log('CSS Variable Color Chips extension deactivated successfully');
		
	} catch (error) {
		console.error('Error during CSS Variable Color Chips extension deactivation:', error);
	}
}

/**
 * Get the current color chip manager instance
 * This can be used by other parts of the extension or for testing
 */
export function getColorChipManager(): ColorChipManagerImpl | undefined {
	return colorChipManager;
}

/**
 * Check if the extension is currently active
 */
export function isExtensionActive(): boolean {
	return colorChipManager?.getStats().isActivated || false;
}

/**
 * Get extension statistics
 */
export function getExtensionStats() {
	return colorChipManager?.getStats() || null;
}

/**
 * Get extension health status
 */
export function getExtensionHealth() {
	return colorChipManager?.getHealthStatus() || {
		overall: 'error' as const,
		components: {},
		issues: ['Extension not initialized']
	};
}