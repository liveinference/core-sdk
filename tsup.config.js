import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  splitting: false,
  dts: true,
  sourcemap: true,
  clean: true
})