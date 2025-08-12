import React from 'react';
import { Model } from './ModelList';

interface ModelPricing extends Model {
  provider: string;
  inputPrice: number;
  outputPrice: number;
}

interface ModelPricingTableProps {
  getModelPricingData: () => ModelPricing[];
}

export function ModelPricingTable({ getModelPricingData }: ModelPricingTableProps) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg border border-white/50 mb-6 overflow-hidden hover:shadow-xl transition-all duration-300">
  <div className="bg-gradient-to-r from-sky-50 to-blue-50 border-b border-sky-100 px-6 py-4">
    <h2 className="text-2xl font-bold text-gray-800 flex items-center">
      <span className="mr-3 text-3xl">💰</span>
      Model Pricing
    </h2>
  </div>
  
  <div className="p-6 space-y-6">
    {/* Introduction Section */}
    <div className="bg-gradient-to-r from-amber-50/50 to-orange-50/50 rounded-2xl p-4 border border-amber-100/50">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-1">
          <div className="w-8 h-8 bg-gradient-to-r from-amber-500 to-orange-600 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div>
          <p className="text-gray-700 leading-relaxed">
            Compare the relative costs of different <span className="font-semibold text-amber-700">LLM models</span>, sorted from most affordable to premium options. 
            All prices are shown in <span className="font-semibold text-orange-700">USD per 1 million tokens</span> for easy comparison.
          </p>
          <div className="mt-2 flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="text-sm text-gray-600">Real-time Pricing</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span className="text-sm text-gray-600">Cost Optimized</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
              <span className="text-sm text-gray-600">Transparent</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Pricing Table */}
    <div className="bg-gradient-to-r from-slate-50/50 to-gray-50/50 rounded-2xl p-4 border border-slate-100/50">
      <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center">
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Pricing Comparison
      </h3>
      
      <div className="bg-white/70 backdrop-blur-sm rounded-xl border border-white/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-gray-100/80 to-slate-100/80 border-b border-gray-200/50">
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider">
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 00-2 2v2a2 2 0 002 2m0 0h14" />
                    </svg>
                    <span>Model</span>
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider">
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span>Provider</span>
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider">
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>Input Price</span>
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider">
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 11l3 3m0 0l3-3m-3 3V8" />
                    </svg>
                    <span>Output Price</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/50">
              {getModelPricingData().map((model, index) => (
                <tr 
                  key={`${model.provider}-${model.id}`}
                  className={`hover:bg-gradient-to-r hover:from-sky-50/30 hover:to-blue-50/30 transition-all duration-200 ${
                    index % 2 === 0 ? 'bg-white/50' : 'bg-gray-50/30'
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-800">{model.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                      model.provider === 'Anthropic' ? 'bg-gradient-to-r from-orange-100 to-red-100 text-orange-800' :
                      model.provider === 'OpenAI' ? 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800' :
                      model.provider === 'Google' ? 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800' :
                      model.provider === 'DeepSeek' ? 'bg-gradient-to-r from-purple-100 to-violet-100 text-purple-800' :
                      'bg-gradient-to-r from-gray-100 to-slate-100 text-gray-800'
                    }`}>
                      {model.provider}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="text-sm font-semibold text-green-600">${model.inputPrice.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="text-sm font-semibold text-blue-600">${model.outputPrice.toFixed(2)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    {/* Footer Note */}
    <div className="bg-gradient-to-r from-gray-50/50 to-slate-50/50 rounded-2xl p-4 border border-gray-100/50">
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-gradient-to-r from-gray-500 to-slate-600 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div>
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-700">Note:</span> Prices are per 1 million tokens. Actual costs may vary based on usage patterns, volume discounts, and provider-specific terms.
          </p>
        </div>
      </div>
    </div>
  </div>
</div>
  );
}
