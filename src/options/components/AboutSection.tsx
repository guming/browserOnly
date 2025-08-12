import React from 'react';

export function AboutSection() {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg border border-white/50 mb-6 overflow-hidden hover:shadow-xl transition-all duration-300">
  <div className="bg-gradient-to-r from-sky-50 to-blue-50 border-b border-sky-100 px-6 py-4">
    <h2 className="text-2xl font-bold text-gray-800 flex items-center">
      <span className="mr-3 text-3xl">🌟</span>
      About BrowserOnly
    </h2>
  </div>
  
  <div className="p-6 space-y-4">
    <div className="bg-gradient-to-r from-sky-50/50 to-blue-50/50 rounded-2xl p-4 border border-sky-100/50">
      <p className="text-gray-700 leading-relaxed">
        <strong className="text-sky-700">BrowserOnly</strong> is a powerful Chrome extension that revolutionizes browser automation by allowing you to control your browser using natural language. 
        It seamlessly integrates with multiple LLM providers including <span className="font-semibold text-blue-600">Anthropic</span>, <span className="font-semibold text-green-600">OpenAI</span>, <span className="font-semibold text-purple-600">Google Gemini</span>, <span className="font-semibold text-orange-600">DeepSeek</span>, and <span className="font-semibold text-indigo-600">Ollama</span> to interpret your instructions and uses Playwright to execute them with precision.
      </p>
    </div>

    <div className="bg-gradient-to-r from-emerald-50/50 to-teal-50/50 rounded-2xl p-4 border border-emerald-100/50">
      <p className="text-gray-700 leading-relaxed">
        <span className="font-semibold text-emerald-700">Specialized Roles:</span> The extension offers multiple expert personas for different tasks - 
        <span className="inline-flex items-center mx-1 px-2 py-1 bg-white/70 rounded-lg text-xs font-medium">🧙🏾‍♂️ Browser Operator</span>
        <span className="inline-flex items-center mx-1 px-2 py-1 bg-white/70 rounded-lg text-xs font-medium">🔍 Research Analyst</span>
        <span className="inline-flex items-center mx-1 px-2 py-1 bg-white/70 rounded-lg text-xs font-medium">⚖️ Legal Advisor</span>
        <span className="inline-flex items-center mx-1 px-2 py-1 bg-white/70 rounded-lg text-xs font-medium">🧮 Mathematics Expert</span>
        <span className="inline-flex items-center mx-1 px-2 py-1 bg-white/70 rounded-lg text-xs font-medium">💻 Code Developer</span>
        <span className="inline-flex items-center mx-1 px-2 py-1 bg-white/70 rounded-lg text-xs font-medium">🧪 TestCase Writer</span>
        and <span className="inline-flex items-center mx-1 px-2 py-1 bg-white/70 rounded-lg text-xs font-medium">❤️ Medical Consultant</span>.
      </p>
    </div>

    <div className="bg-gradient-to-r from-amber-50/50 to-orange-50/50 rounded-2xl p-4 border border-amber-100/50">
      <p className="text-gray-700 leading-relaxed mb-3">
        <span className="font-semibold text-amber-700">Getting Started:</span> Simply click on the extension icon to open the side panel, enter your instructions in the prompt field, and hit Enter to watch the magic happen.
      </p>
      
      <div className="flex items-center justify-center space-x-2 py-2">
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-sky-400 rounded-full"></div>
          <span className="text-sm text-gray-600">Click Extension</span>
        </div>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
          <span className="text-sm text-gray-600">Type Command</span>
        </div>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-green-400 rounded-full"></div>
          <span className="text-sm text-gray-600">Execute</span>
        </div>
      </div>
    </div>

    <div className="bg-gradient-to-r from-purple-50/50 to-pink-50/50 rounded-2xl p-4 border border-purple-100/50">
      <p className="text-gray-700 leading-relaxed flex items-center">
        <span className="mr-2 text-2xl">🙏</span>
        <span>
          <span className="font-semibold text-purple-700">Special Thanks</span> to the amazing open-source projects: 
          <a href="#" className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 underline-offset-2 transition-colors duration-200 mx-1 font-medium">BrowserBee</a>
          and 
          <a href="#" className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 underline-offset-2 transition-colors duration-200 mx-1 font-medium">Mermaid</a>
          for their incredible contributions to the developer community.
        </span>
      </p>
    </div>
  </div>
</div>
  );
}
