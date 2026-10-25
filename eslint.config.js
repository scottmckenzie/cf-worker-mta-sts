import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';

export default defineConfig([
	globalIgnores(['dist/']),
	js.configs.recommended,
	{
		files: ['src/**/*.js'],
		languageOptions: {
			globals: globals.serviceworker,
		},
	},
	{
		files: ['test/**/*.js'],
		languageOptions: {
			globals: globals.node,
		},
	},
	{
		files: ['**/*.js'],
		rules: {
			'eqeqeq': 'error',
		},
	},
]);
