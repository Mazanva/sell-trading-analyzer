import React, { useState, useRef } from 'react';

const SellAnalyzer = () => {
  const [trades, setTrades] = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [currentScreenshot, setCurrentScreenshot] = useState(0);
  const [manualEntry, setManualEntry] = useState({
    pair: '',
    total: '',
    result: '',
    isActive: false
  });
  const fileInputRef = useRef(null);

  // Handle multiple file upload
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || e.dataTransfer?.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) return;

    // Convert files to preview URLs
    const screenshotPreviews = [];
    let processed = 0;
    
    imageFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        screenshotPreviews[index] = {
          id: Date.now() + index,
          file,
          preview: e.target.result,
          name: file.name,
          trades: []
        };
        processed++;
        
        if (processed === imageFiles.length) {
          // Sort by index to maintain order
          const sortedScreenshots = screenshotPreviews.sort((a, b) => a.id - b.id);
          setScreenshots(sortedScreenshots);
          setCurrentScreenshot(0);
          setManualEntry(prev => ({ ...prev, isActive: sortedScreenshots.length > 0 }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Add trade manually
  const addTrade = () => {
    const { pair, total, result } = manualEntry;
    
    if (!pair || !total || result === '') {
      alert('Prosím vyplňte všechna pole');
      return;
    }

    const numTotal = parseFloat(total);
    const numResult = parseFloat(result);
    const profit = (numTotal * numResult) / 100;

    const newTrade = {
      id: Date.now() + Math.random(),
      pair: pair.toUpperCase(),
      total: numTotal,
      result: numResult,
      profit: profit,
      screenshot: currentScreenshot + 1
    };

    setTrades(prev => [...prev, newTrade]);
    
    // Clear form for next entry
    setManualEntry(prev => ({
      ...prev,
      pair: '',
      total: '',
      result: ''
    }));
    
    // Focus back to pair input for quick entry
    setTimeout(() => {
      document.getElementById('pairInput')?.focus();
    }, 100);
  };

  // Quick add with Enter key
  const handleKeyPress = (e, field) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'pair') {
        document.getElementById('totalInput')?.focus();
      } else if (field === 'total') {
        document.getElementById('resultInput')?.focus();
      } else if (field === 'result') {
        addTrade();
      }
    }
  };

  // Smart auto-fill for common pairs
  const handlePairChange = (value) => {
    let formattedPair = value.toUpperCase();
    
    // Auto-add /USDT if not present
    if (formattedPair && !formattedPair.includes('/') && !formattedPair.includes('-')) {
      const commonPairs = ['SQR', 'ALGO', 'BONK', 'DOGE', 'SHIB', 'ETC', 'OP', 'BTC', 'ETH'];
      if (commonPairs.some(pair => formattedPair.startsWith(pair))) {
        formattedPair += '/USDT';
      }
    }
    
    setManualEntry(prev => ({ ...prev, pair: formattedPair }));
  };

  // Navigation between screenshots
  const nextScreenshot = () => {
    if (currentScreenshot < screenshots.length - 1) {
      setCurrentScreenshot(currentScreenshot + 1);
    }
  };

  const prevScreenshot = () => {
    if (currentScreenshot > 0) {
      setCurrentScreenshot(currentScreenshot - 1);
    }
  };

  // Delete trade
  const deleteTrade = (id) => {
    setTrades(prev => prev.filter(trade => trade.id !== id));
  };

  // Clear all
  const clearAll = () => {
    if (window.confirm('Vymazat všechny data a obrázky?')) {
      setTrades([]);
      setScreenshots([]);
      setCurrentScreenshot(0);
      setManualEntry({ pair: '', total: '', result: '', isActive: false });
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('border-red-400', 'bg-red-900/20');
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-red-400', 'bg-red-900/20');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-red-400', 'bg-red-900/20');
    handleFileUpload(e);
  };

  // Stats calculations
  const totalProfit = trades.reduce((sum, trade) => sum + trade.profit, 0);
  const avgResult = trades.length > 0 ? trades.reduce((sum, trade) => sum + trade.result, 0) / trades.length : 0;
  const totalAmount = trades.reduce((sum, trade) => sum + trade.total, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
            ⚡ SELL Analyzer - Manual Pro
          </h1>
          <p className="text-xl text-gray-300">
            100% přesnost • Manual entry s live preview • Rychlé shortcuts
          </p>
        </div>

        {/* Upload Section */}
        {screenshots.length === 0 && (
          <div className="bg-white/10 rounded-2xl p-8 mb-8 backdrop-blur-sm border border-white/20">
            <div 
              className="border-2 border-dashed border-red-500 rounded-xl p-16 text-center cursor-pointer transition-all duration-300 hover:border-red-400 hover:bg-red-900/10"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-8xl mb-6">⚡📱⚡</div>
              <h3 className="text-2xl font-semibold mb-4">Hybrid Manual + Visual Approach</h3>
              <div className="bg-gradient-to-r from-green-900/50 to-blue-900/50 rounded-lg p-6 mb-4">
                <p className="text-white font-semibold mb-3">⚡ 100% přesný workflow:</p>
                <div className="text-left text-sm space-y-2">
                  <div>1. 📷 Nahrajte screenshoty</div>
                  <div>2. 👀 Prohlédněte si obrázek vedle formuláře</div>
                  <div>3. ⌨️ Rychle zadejte data (Enter = další pole)</div>
                  <div>4. 🚀 Instant přidání do tabulky</div>
                </div>
              </div>
              <p className="text-gray-300 text-lg mb-4">
                <strong>Rychlé • Spolehlivé • Bez chyb OCR</strong>
              </p>
              <p className="text-gray-400">
                Klikněte nebo přetáhněte více obrázků
              </p>
            </div>
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*" 
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        )}

        {/* Manual Entry Interface */}
        {screenshots.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
            
            {/* Screenshot Viewer */}
            <div className="bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/20">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">
                  📷 Screenshot {currentScreenshot + 1} / {screenshots.length}
                </h3>
                <div className="flex gap-2">
                  <button 
                    onClick={prevScreenshot}
                    disabled={currentScreenshot === 0}
                    className="px-3 py-1 bg-gray-600 rounded disabled:bg-gray-800 disabled:text-gray-500"
                  >
                    ◀ Prev
                  </button>
                  <button 
                    onClick={nextScreenshot}
                    disabled={currentScreenshot === screenshots.length - 1}
                    className="px-3 py-1 bg-gray-600 rounded disabled:bg-gray-800 disabled:text-gray-500"
                  >
                    Next ▶
                  </button>
                </div>
              </div>
              
              {screenshots[currentScreenshot] && (
                <div className="relative">
                  <img 
                    src={screenshots[currentScreenshot].preview} 
                    alt={`Screenshot ${currentScreenshot + 1}`}
                    className="w-full max-h-[600px] object-contain rounded-lg border border-white/20"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/70 px-3 py-1 rounded text-sm">
                    {screenshots[currentScreenshot].name}
                  </div>
                </div>
              )}
              
              {/* Quick navigation thumbnails */}
              {screenshots.length > 1 && (
                <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
                  {screenshots.map((screenshot, index) => (
                    <img
                      key={screenshot.id}
                      src={screenshot.preview}
                      alt={`Thumb ${index + 1}`}
                      className={`w-16 h-16 object-cover rounded cursor-pointer border-2 transition-all ${
                        index === currentScreenshot ? 'border-red-400' : 'border-gray-600 hover:border-red-300'
                      }`}
                      onClick={() => setCurrentScreenshot(index)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Manual Entry Form */}
            <div className="bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/20">
              <h3 className="text-xl font-semibold mb-4">⌨️ Rychlé zadávání SELL transakcí</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">
                    🔗 Trading Pair
                  </label>
                  <input
                    id="pairInput"
                    type="text"
                    placeholder="SQR, ALGO, BONK... (auto +/USDT)"
                    value={manualEntry.pair}
                    onChange={(e) => handlePairChange(e.target.value)}
                    onKeyPress={(e) => handleKeyPress(e, 'pair')}
                    className="w-full px-4 py-3 text-lg rounded-lg bg-white/10 border border-white/30 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">
                    💰 Total Amount (USDT)
                  </label>
                  <input
                    id="totalInput"
                    type="number"
                    placeholder="274.1200"
                    step="0.0001"
                    value={manualEntry.total}
                    onChange={(e) => setManualEntry(prev => ({ ...prev, total: e.target.value }))}
                    onKeyPress={(e) => handleKeyPress(e, 'total')}
                    className="w-full px-4 py-3 text-lg rounded-lg bg-white/10 border border-white/30 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">
                    📊 Result Percentage (%)
                  </label>
                  <input
                    id="resultInput"
                    type="number"
                    placeholder="6.26, -2.43, 1.55..."
                    step="0.01"
                    value={manualEntry.result}
                    onChange={(e) => setManualEntry(prev => ({ ...prev, result: e.target.value }))}
                    onKeyPress={(e) => handleKeyPress(e, 'result')}
                    className="w-full px-4 py-3 text-lg rounded-lg bg-white/10 border border-white/30 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
                  />
                </div>
                
                {/* Live Profit Preview */}
                {manualEntry.total && manualEntry.result && (
                  <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-lg p-4">
                    <div className="text-center">
                      <div className="text-sm text-gray-300">💎 Vypočítaný profit:</div>
                      <div className={`text-2xl font-bold font-mono ${
                        (parseFloat(manualEntry.total) * parseFloat(manualEntry.result)) / 100 >= 0 
                          ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {((parseFloat(manualEntry.total) || 0) * (parseFloat(manualEntry.result) || 0) / 100).toFixed(4)} USDT
                      </div>
                    </div>
                  </div>
                )}
                
                <button
                  onClick={addTrade}
                  className="w-full px-6 py-4 bg-gradient-to-r from-red-500 to-red-600 rounded-lg font-bold text-lg hover:from-red-600 hover:to-red-700 transition-all duration-300 transform hover:scale-105"
                >
                  ➕ Přidat SELL transakci
                </button>
                
                <div className="text-xs text-gray-400 text-center space-y-1">
                  <div>💡 Tip: Použijte Enter pro rychlé přepínání mezi poli</div>
                  <div>⌨️ Pair → Enter → Total → Enter → Result → Enter = Přidat</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {trades.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-2xl p-6 text-center">
              <div className="text-4xl font-bold mb-2">{trades.length}</div>
              <div className="text-red-100">SELL transakcí</div>
            </div>
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-center">
              <div className="text-4xl font-bold mb-2">{totalAmount.toFixed(2)}</div>
              <div className="text-blue-100">Total USDT</div>
            </div>
            <div className={`bg-gradient-to-r ${totalProfit >= 0 ? 'from-green-600 to-green-700' : 'from-red-600 to-red-700'} rounded-2xl p-6 text-center`}>
              <div className="text-4xl font-bold mb-2">
                {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(4)}
              </div>
              <div className={totalProfit >= 0 ? 'text-green-100' : 'text-red-100'}>
                Celkový profit USDT
              </div>
            </div>
            <div className={`bg-gradient-to-r ${avgResult >= 0 ? 'from-green-600 to-green-700' : 'from-red-600 to-red-700'} rounded-2xl p-6 text-center`}>
              <div className="text-4xl font-bold mb-2">
                {avgResult >= 0 ? '+' : ''}{avgResult.toFixed(2)}%
              </div>
              <div className={avgResult >= 0 ? 'text-green-100' : 'text-red-100'}>
                Průměrný result
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {trades.length > 0 && (
          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={clearAll}
              className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 rounded-lg font-semibold hover:from-red-700 hover:to-red-800 transition-all duration-300"
            >
              🗑️ Vymazat vše
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 rounded-lg font-semibold hover:from-gray-700 hover:to-gray-800 transition-all duration-300"
            >
              🔄 Nový projekt
            </button>
          </div>
        )}

        {/* Results Table */}
        {trades.length > 0 && (
          <div className="bg-white/10 rounded-2xl overflow-hidden backdrop-blur-sm border border-white/20 shadow-2xl">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6">
              <h2 className="text-2xl font-bold text-center">
                ⚡ SELL Transakce - 100% přesnost
              </h2>
              <p className="text-center text-red-100 text-sm mt-2">
                {screenshots.length} obrázků • {trades.length} manuálně zadaných transakcí
              </p>
            </div>
            
            {/* Desktop Table */}
            <div className="hidden md:block">
              <div className="bg-red-900/30 px-8 py-4 border-b border-white/10">
                <div className="grid grid-cols-5 gap-6 font-bold text-xl">
                  <div>🔗 Pair</div>
                  <div>💰 Total</div>
                  <div>📊 Result</div>
                  <div>💎 Profit</div>
                  <div>🗑️</div>
                </div>
              </div>
              <div className="divide-y divide-white/10">
                {trades.map((trade) => (
                  <div key={trade.id} className="px-8 py-6 hover:bg-white/5 transition-colors">
                    <div className="grid grid-cols-5 gap-6 items-center text-lg">
                      <div className="font-bold text-red-400 text-xl">{trade.pair}</div>
                      <div className="font-mono font-semibold text-lg">{trade.total.toFixed(4)}</div>
                      <div className={`font-bold text-xl ${trade.result >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.result >= 0 ? '+' : ''}{trade.result.toFixed(2)}%
                      </div>
                      <div className={`font-mono font-bold text-xl ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(4)}
                      </div>
                      <button
                        onClick={() => deleteTrade(trade.id)}
                        className="text-red-400 hover:text-red-300 transition-colors text-2xl"
                        title="Smazat transakci"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden p-4 space-y-4">
              {trades.map((trade) => (
                <div key={trade.id} className="bg-white/5 rounded-xl p-6 border border-white/10 relative">
                  <button
                    onClick={() => deleteTrade(trade.id)}
                    className="absolute top-3 right-3 text-red-400 hover:text-red-300 text-xl"
                  >
                    ×
                  </button>
                  <div className="text-center mb-4">
                    <div className="font-bold text-2xl text-red-400">{trade.pair}</div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-300">💰 Total:</span>
                      <span className="font-mono font-semibold text-lg">{trade.total.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">📊 Result:</span>
                      <span className={`font-bold text-lg ${trade.result >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.result >= 0 ? '+' : ''}{trade.result.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">💎 Profit:</span>
                      <span className={`font-mono font-bold text-lg ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-gray-400">
          <p>⚡ Manual precision • Visual assistance • Keyboard shortcuts • Zero OCR errors</p>
        </div>
      </div>
    </div>
  );
};

export default SellAnalyzer;
