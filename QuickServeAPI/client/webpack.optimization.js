/**
 * FinBot v4 - Webpack Optimization Configuration
 * Advanced bundle optimization with tree shaking and code splitting
 */

const path = require('path');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const CompressionPlugin = require('compression-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

module.exports = {
  // Enable tree shaking
  mode: 'production',
  
  // Optimization configuration
  optimization: {
    // Enable tree shaking
    usedExports: true,
    sideEffects: false,
    
    // Minimize bundle
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true, // Remove console.log in production
            drop_debugger: true,
            pure_funcs: ['console.log', 'console.info', 'console.debug'],
            passes: 2 // Multiple passes for better compression
          },
          mangle: {
            safari10: true // Fix Safari 10 issues
          },
          format: {
            comments: false // Remove comments
          }
        },
        extractComments: false,
        parallel: true // Use multiple processes
      }),
      new CssMinimizerPlugin({
        minimizerOptions: {
          preset: [
            'default',
            {
              discardComments: { removeAll: true },
              normalizeWhitespace: true,
              colormin: true,
              convertValues: true,
              discardDuplicates: true,
              discardEmpty: true,
              mergeRules: true,
              minifyFontValues: true,
              minifySelectors: true
            }
          ]
        }
      })
    ],
    
    // Split chunks for better caching
    splitChunks: {
      chunks: 'all',
      minSize: 20000,
      maxSize: 244000,
      cacheGroups: {
        // Vendor libraries
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 10,
          reuseExistingChunk: true
        },
        
        // React and React DOM
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
          name: 'react',
          chunks: 'all',
          priority: 20,
          reuseExistingChunk: true
        },
        
        // UI libraries (heavy components)
        ui: {
          test: /[\\/]node_modules[\\/](@headlessui|@heroicons|lucide-react)[\\/]/,
          name: 'ui',
          chunks: 'all',
          priority: 15,
          reuseExistingChunk: true
        },
        
        // Chart libraries
        charts: {
          test: /[\\/]node_modules[\\/](chart\.js|recharts|d3)[\\/]/,
          name: 'charts',
          chunks: 'all',
          priority: 15,
          reuseExistingChunk: true
        },
        
        // Date libraries
        date: {
          test: /[\\/]node_modules[\\/](date-fns|moment|dayjs)[\\/]/,
          name: 'date',
          chunks: 'all',
          priority: 15,
          reuseExistingChunk: true
        },
        
        // Common components
        common: {
          name: 'common',
          minChunks: 2,
          chunks: 'all',
          priority: 5,
          reuseExistingChunk: true,
          enforce: true
        }
      }
    },
    
    // Runtime chunk for better caching
    runtimeChunk: {
      name: 'runtime'
    }
  },
  
  // Resolve configuration for tree shaking
  resolve: {
    // Enable tree shaking for these extensions
    mainFields: ['es2015', 'module', 'main'],
    
    // Alias for smaller alternatives
    alias: {
      // Use smaller lodash imports
      'lodash': 'lodash-es',
      
      // Use smaller moment alternative
      'moment': 'dayjs',
      
      // Smaller React alternatives for production
      ...(process.env.NODE_ENV === 'production' && {
        'react': 'preact/compat',
        'react-dom': 'preact/compat'
      })
    },
    
    // Fallback for Node.js modules
    fallback: {
      "crypto": false,
      "stream": false,
      "util": false,
      "buffer": false,
      "process": false
    }
  },
  
  // Module rules for optimization
  module: {
    rules: [
      // Optimize imports
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', {
                  modules: false, // Keep ES modules for tree shaking
                  useBuiltIns: 'usage',
                  corejs: 3
                }],
                '@babel/preset-react',
                '@babel/preset-typescript'
              ],
              plugins: [
                // Import optimization
                ['import', {
                  libraryName: 'lodash',
                  libraryDirectory: '',
                  camel2DashComponentName: false
                }, 'lodash'],
                ['import', {
                  libraryName: 'date-fns',
                  libraryDirectory: '',
                  camel2DashComponentName: false
                }, 'date-fns'],
                
                // Remove unused imports
                'babel-plugin-transform-remove-unused-imports',
                
                // Optimize React
                '@babel/plugin-transform-react-constant-elements',
                '@babel/plugin-transform-react-inline-elements'
              ]
            }
          }
        ]
      },
      
      // Optimize CSS
      {
        test: /\.css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              modules: {
                auto: true,
                localIdentName: process.env.NODE_ENV === 'production' 
                  ? '[hash:base64:5]' 
                  : '[name]__[local]--[hash:base64:5]'
              }
            }
          },
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [
                  'tailwindcss',
                  'autoprefixer',
                  ...(process.env.NODE_ENV === 'production' ? [
                    ['@fullhuman/postcss-purgecss', {
                      content: ['./src/**/*.{js,jsx,ts,tsx,html}'],
                      defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || [],
                      safelist: {
                        standard: [/^(bg-|text-|border-|hover:|focus:)/],
                        deep: [/^(animate-|transition-)/],
                        greedy: [/^(grid-|col-|row-)/]
                      }
                    }],
                    'cssnano'
                  ] : [])
                ]
              }
            }
          }
        ]
      }
    ]
  },
  
  // Plugins for optimization
  plugins: [
    // Analyze bundle size
    ...(process.env.ANALYZE === 'true' ? [
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        openAnalyzer: false,
        reportFilename: 'bundle-report.html'
      })
    ] : []),
    
    // Compress assets
    new CompressionPlugin({
      algorithm: 'gzip',
      test: /\.(js|css|html|svg)$/,
      threshold: 8192,
      minRatio: 0.8
    }),
    
    // Brotli compression
    new CompressionPlugin({
      filename: '[path][base].br',
      algorithm: 'brotliCompress',
      test: /\.(js|css|html|svg)$/,
      compressionOptions: {
        level: 11
      },
      threshold: 8192,
      minRatio: 0.8
    })
  ],
  
  // Performance hints
  performance: {
    hints: 'warning',
    maxEntrypointSize: 250000, // 250KB
    maxAssetSize: 250000,
    assetFilter: (assetFilename) => {
      return assetFilename.endsWith('.js') || assetFilename.endsWith('.css');
    }
  },
  
  // Stats configuration
  stats: {
    chunks: false,
    chunkModules: false,
    modules: false,
    assets: true,
    entrypoints: false,
    performance: true,
    timings: true,
    builtAt: true
  }
};