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
  entry: './src/main.ts',
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
  entry: './src/renderer.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'renderer.js'
  },
  performance: {
    hints: false // Disable performance hints for renderer since it's a desktop app
  }
};

module.exports = [mainConfig, rendererConfig]; 