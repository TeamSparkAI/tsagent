import path from 'path';
import webpack from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commonConfig = {
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'assets/images/[hash][ext][query]'
        }
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.css']
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false
          }
        },
        extractComments: false
      })
    ]
  }
};

const mainConfig = {
  ...commonConfig,
  target: 'electron-main',
  entry: './src/main/main.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.js',
    module: true
  },
  experiments: {
    outputModule: true
  },
  externals: {
    electron: 'module electron',
    'node-llama-cpp': 'module node-llama-cpp',
    '@tsagent/core': 'module @tsagent/core'
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production')
    })
  ]
};

const rendererConfig = {
  ...commonConfig,
  target: 'web',
  entry: './src/renderer/renderer.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'renderer.js',
    assetModuleFilename: 'assets/[hash][ext][query]'
  },
  module: {
    rules: [
      ...commonConfig.module.rules,
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader'
        ]
      }
    ]
  },
  performance: {
    hints: false
  }
};

const preloadConfig = {
  ...commonConfig,
  target: 'electron-preload',
  entry: './src/preload/preload.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'preload.js'
  },
  externals: {
    electron: 'commonjs electron'
  }
};

export default [mainConfig, rendererConfig, preloadConfig]; 