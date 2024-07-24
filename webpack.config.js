const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");
const { DefinePlugin } = require('webpack');

module.exports = {
    mode: 'development',
    entry: './index.js',
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'dist'),
    },
    devServer: {
        static: {
            directory: path.join(__dirname, './')
        },
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                './index.html'
            ]
        }),
        new DefinePlugin({
            'process.env':{
                'COMMUNICATION_SERVICES_CONNECTION_STRING': JSON.stringify(process.env.COMMUNICATION_SERVICES_CONNECTION_STRING),
                'AZURE_AI_TRANSLATOR_API_KEY': JSON.stringify(process.env.AZURE_AI_TRANSLATOR_API_KEY),
                'AZURE_AI_TRANSLATOR_ENDPOINT': JSON.stringify(process.env.AZURE_AI_TRANSLATOR_ENDPOINT),
                'AZURE_AI_TRANSLATOR_REGION': JSON.stringify(process.env.AZURE_AI_TRANSLATOR_REGION),
            },
        }),
    ]
};