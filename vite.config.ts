import { defineConfig } from 'vite'

export default defineConfig({
	build: {
		rollupOptions: {
			input: {
				main: 'index.html',
				sandbox: 'sandbox.html',
			},
		},
	},
})