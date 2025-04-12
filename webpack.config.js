//import path from 'path';
//import webpack from 'webpack';
//import TerserPlugin from 'terser-webpack-plugin';

const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

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
    extensions: ['.tsx', '.ts', '.js']
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
    filename: 'main.js'
  },
  externals: {
    electron: 'commonjs electron'
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
  performance: {
    hints: false // Disable performance hints for renderer since it's a desktop app
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

module.exports = [mainConfig, rendererConfig, preloadConfig]; 