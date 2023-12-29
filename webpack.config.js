const path = require('path');
const isProduction = process.env.NODE_ENV == 'production';
//const nodeExternals = require('webpack-node-externals');

const config = {
    entry: './src/client.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        library: 'LiveInferenceSDK',
        libraryTarget:'window',
        libraryExport: 'default',
        filename: 'client.js'
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/i,
                loader: 'ts-loader',
                exclude: ['/node_modules/'],
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.jsx', '.js', '...'],
    },
    //externals: [nodeExternals()],
};

module.exports = () => {
    if (isProduction) {
        config.mode = 'production';
        config.devtool = 'source-map';
        
    } else {
        config.mode = 'development';
        config.devtool = 'source-map';
    }
    return config;
};
