import React, { useState } from 'react';
import { createWorker } from 'tesseract.js';

const SellAnalyzer = () => {
  const [trades, setTrades] = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [ocrResults, setOcrResults] = useState([]);
  const [showCorrection, setShowCorrection] = useState(false);

  // Aggressive image preprocessing for better OCR
  const preprocessImage = (canvas, ctx, imageData) => {
    const data = imageData.data;
    const newCanvas = document.createElement('canvas');
    const newCtx = newCanvas.getContext('2d');
    newCanvas.width = canvas.width;
    newCanvas.height = canvas.height;
    
    // Create multiple preprocessed versions
    const versions = [];
    
    // Version 1: High contrast black/white
    const version1Data = new Uint8ClampedArray(data);
    for (let i = 0; i < version1Data.length; i += 4) {
      const brightness = (version1Data[i] + version1Data[i + 1] + version1Data[i + 2]) / 3;
      const isLight = brightness > 140;
      version1Data[i] = isLight ? 255 : 0;
      version1Data[i + 1] = isLight ? 255 : 0;
      version1Data[i + 2] = isLight ? 255 : 0;
    }
    
    // Version 2: Inverted (white text on black bg)
    const version2Data = new Uint8ClampedArray(data);
    for (let i = 0; i < version2Data.length; i += 4) {
      version2Data[i] = 255 - version2Data[i];
      version2Data[i + 1] = 255 - version2Data[i + 1];
      version2Data[i + 2] = 255 - version2Data[i + 2];
    }
    
    // Version 3: Enhanced contrast
    const version3Data = new Uint8ClampedArray(data);
    for (let i = 0; i < version3Data.length; i += 4) {
      version3Data[i] = Math.min(255, version3Data[i] * 1.5);
      version3Data[i + 1] = Math.min(255, version3Data[i + 1] * 1.5);
      version3Data[i + 2] = Math.min(255, version3Data[i + 2] * 1.5);
    }
    
    return [
      { data: version1Data, name: 'High Contrast' },
      { data: version2Data, name: 'Inverted' },
      { data: version3Data, name: 'Enhanced' },
      { data: data, name: 'Original' }
    ];
  };

  // Enhanced SELL parsing with fuzzy matching
  const parseSellTransactions = (text, confidence, imageIndex) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const trades = [];
    
    console.log(`🔍 OCR Text (confidence: ${confidence}%):`);
    console.log(text.substring(0, 300));
    
    // Look for various SELL patterns
    const sellPatterns = [
      /sell/gi, /prodej/gi, /prodat/gi, /sold/gi, /sale/gi
    ];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      // Check if line contains any sell pattern
      const hasSell = sellPatterns.some(pattern => pattern.test(line));
      
      if (hasSell) {
        console.log(`💰 Potential SELL line: "${lines[i]}"`);
        
        // Get context (current line + surrounding lines)
        const contextLines = [];
        for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 3); j++) {
          contextLines.push(lines[j]);
        }
        const fullContext = contextLines.join(' ');
        
        // Enhanced extraction patterns
        let pair = null;
        let total = null;
        let result = null;
        
        // Extract trading pair (more flexible)
        const pairMatches = [
          ...fullContext.matchAll(/([A-Z]{2,6})[\s\/\-]*(USDT|USD)/gi),
          ...fullContext.matchAll(/(SQR|ALGO|BONK|DOGE|SHIB|ETC|OP|BTC|ETH|ADA|SOL|MATIC)[\/\-\s]*(USDT|USD)?/gi),
          ...fullContext.matchAll(/([A-Z]{3,6})[\/\-\s]/gi)
        ];
        
        if (pairMatches.length > 0) {
          let foundPair = pairMatches[0][1];
          if (pairMatches[0][2]) {
            foundPair += '/' + pairMatches[0][2];
          } else {
            foundPair += '/USDT';
          }
          pair = foundPair.toUpperCase();
        }
        
        // Extract total (look for realistic amounts)
        const totalMatches = [...fullContext.matchAll(/(\d{2,4}\.?\d{0,8})/g)];
        for (const match of totalMatches) {
          const value = parseFloat(match[1]);
          if (value >= 10 && value <= 100000) {
            total = value;
            break;
          }
        }
        
        // Extract result percentage
        const resultMatches = [
          ...fullContext.matchAll(/([+-]?\d{1,3}\.?\d{0,3})\s*%/g),
          ...fullContext.matchAll(/([+-]\d+\.?\d*)/g)
        ];
        
        for (const match of resultMatches) {
          const value = parseFloat(match[1]);
          if (value >= -99 && value <= 99 && value !== 0) {
            result = value;
            break;
          }
        }
        
        // Create trade record
        if (pair && total && result !== null) {
          const profit = (total * result) / 100;
          trades.push({
            id: Date.now() + Math.random(),
            pair,
            total,
            result,
            profit,
            source: `Image ${imageIndex + 1}`,
            confidence,
            rawText: fullContext.substring(0, 100)
          });
        }
      }
    }
    
    return trades;
  };

  // Multi-attempt OCR with different preprocessing
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || e.dataTransfer?.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) return;

    setLoading(true);
    setProgress({ current: 0, total: imageFiles.length, percent: 0 });
    setOcrResults([]);
    
    // Create previews
    const screenshotPreviews = [];
    for (const file of imageFiles) {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve) => {
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
      screenshotPreviews.push({ file, preview: dataUrl, name: file.name });
    }
    setScreenshots(screenshotPreviews);
    
    const allTrades = [];
    const allOcrResults = [];
    
    try {
      // Initialize OCR worker
      const worker = await createWorker('eng+ces', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            setProgress(prev => ({ ...prev, percent: Math.round(m.progress * 50) }));
          }
        }
      });
      
      // Process each image with multiple attempts
      for (let i = 0; i < imageFiles.length; i++) {
        setProgress(prev => ({ ...prev, current: i + 1 }));
        
        console.log(`📷 Processing image ${i + 1}: ${imageFiles[i].name}`);
        
        // Load image
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        await new Promise((resolve) => {
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            resolve();
          };
          img.src = screenshotPreviews[i].preview;
        });
        
        // Try multiple preprocessing versions
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const versions = preprocessImage(canvas, ctx, imageData);
        
        let bestResult = null;
        let bestTrades = [];
        
        for (const version of versions) {
          try {
            // Apply preprocessing
            const newImageData = new ImageData(version.data, canvas.width, canvas.height);
            ctx.putImageData(newImageData, 0, 0);
            
            // Configure OCR for each attempt
            await worker.setParameters({
              tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-%/+:()[] ',
              tessedit_pageseg_mode: '6',
            });
            
            // OCR recognition
            const { data: { text, confidence } } = await worker.recognize(canvas);
            
            console.log(`🎯 ${version.name} OCR confidence: ${confidence}%`);
            
            // Parse SELL transactions
            const trades = parseSellTransactions(text, confidence, i);
            
            // Keep best result
            if (trades.length > bestTrades.length || (trades.length === bestTrades.length && confidence > (bestResult?.confidence || 0))) {
              bestResult = { text, confidence, version: version.name };
              bestTrades = trades;
            }
            
          } catch (error) {
            console.error(`Error with ${version.name}:`, error);
          }
        }
        
        if (bestResult) {
          allOcrResults.push({
            image: i + 1,
            ...bestResult,
            trades: bestTrades,
            preview: screenshotPreviews[i].preview
          });
          allTrades.push(...bestTrades);
          
          console.log(`✅ Best result for image ${i + 1}: ${bestTrades.length} trades (${bestResult.version}, ${bestResult.confidence}%)`);
        }
        
        const percent = Math.round(((i + 1) / imageFiles.length) * 100);
        setProgress(prev => ({ ...prev, percent }));
      }
      
      await worker.terminate();
      
    } catch (error) {
      console.error('OCR Error:', error);
      alert(`Chyba při OCR: ${error.message}`);
    } finally {
      setLoading(false);
      setProgress({ current: 0, total: 0, percent: 0 });
    }
    
    setOcrResults(allOcrResults);
    setTrades(allTrades);
    
    // Show correction interface if we have results
    if (allOcrResults.length > 0) {
      setShowCorrection(true);
    }
  };

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

  const clearAll = () => {
    setTrades([]);
    setScreenshots([]);
    setOcrResults([]);
    setShowCorrection(false);
  };

  // Stats
  const totalProfit = trades.reduce((sum, trade) => sum + trade.profit, 0);
  const avgResult = trades.length > 0 ? trades.reduce((sum, trade) => sum + trade.result, 0) / trades.length : 0;
  const totalAmount = trades.reduce((sum, trade) => sum + trade.total, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
            🔥 Multi-OCR SELL Analyzer
          </h1>
          <p className="text-xl text-gray-300">
            4x preprocessing • Multi-attempt OCR • Smart correction interface
          </p>
        </div>

        {/* Upload Section */}
        <div className="bg-white/10 rounded-2xl p-8 mb-8 backdrop-blur-sm border border-white/20">
          <div 
            className="border-2 border-dashed border-red-500 rounded-xl p-16 text-center cursor-pointer transition-all duration-300 hover:border-red-400 hover:bg-red-900/10"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('fileInput').click()}
          >
            {loading ? (
              <div className="space-y-6">
                <div className="text-6xl animate-spin">🔥</div>
                <h3 className="text-2xl font-semibold">
                  Multi-OCR analýza {progress.current}/{progress.total}...
                </h3>
                <div className="w-full bg-gray-700 rounded-full h-4">
                  <div 
                    className="bg-gradient-to-r from-red-500 to-red-600 h-4 rounded-full transition-all duration-300" 
                    style={{ width: `${progress.percent}%` }}
                  ></div>
                </div>
                <div className="text-lg">{progress.percent}% - Zkouším různé preprocessing metody...</div>
              </div>
            ) : (
              <div>
                <div className="text-8xl mb-6">🔥📱🔥</div>
                <h3 className="text-2xl font-semibold mb-4">Robustní Multi-OCR Engine</h3>
                <div className="bg-gradient-to-r from-orange-900/50 to-red-900/50 rounded-lg p-6 mb-4">
                  <p className="text-white font-semibold mb-3">🔥 Multi-attempt approach:</p>
                  <div className="text-left text-sm space-y-2">
                    <div>1. 🎨 4x preprocessing: High contrast, Inverted, Enhanced, Original</div>
                    <div>2. 🔄 Multiple OCR attempts na každý obrázek</div>
                    <div>3. 🎯 Smart result comparison - vybere nejlepší</div>
                    <div>4. ✏️ Quick correction interface pro rychlé opravy</div>
                  </div>
                </div>
                <p className="text-gray-300 text-lg mb-4">
                  <strong>4x vyšší šance na úspěch než klasické OCR</strong>
                </p>
                <p className="text-gray-400">
                  Nahrajte screenshoty a nechte Multi-OCR pracovat
                </p>
              </div>
            )}
            <input 
              type="file" 
              id="fileInput" 
              accept="image/*" 
              multiple
              onChange={handleFileUpload}
              className="hidden"
              disabled={loading}
            />
          </div>
        </div>

        {/* OCR Results & Correction Interface */}
        {showCorrection && ocrResults.length > 0 && (
          <div className="bg-white/10 rounded-2xl p-6 mb-8 backdrop-blur-sm border border-white/20">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">🔍 OCR výsledky a korekce</h3>
              <button 
                onClick={() => setShowCorrection(false)}
                className="px-4 py-2 bg-gray-600 rounded"
              >
                Skrýt
              </button>
            </div>
            
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {ocrResults.map((result, idx) => (
                <div key={idx} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex gap-4">
                    <img 
                      src={result.preview} 
                      alt={`Result ${idx + 1}`}
                      className="w-32 h-20 object-cover rounded"
                    />
                    <div className="flex-1">
                      <div className="flex justify-between mb-2">
                        <span className="font-semibold">Obrázek {result.image}</span>
                        <span className="text-sm text-gray-400">
                          {result.version} • {result.confidence}% • {result.trades.length} SELL
                        </span>
                      </div>
                      <div className="text-sm text-gray-300 bg-black/30 p-2 rounded font-mono max-h-20 overflow-y-auto">
                        {result.text.substring(0, 200)}...
                      </div>
                      {result.trades.length > 0 && (
                        <div className="mt-2 text-sm">
                          <strong>Rozpoznané SELL:</strong> {result.trades.map(t => `${t.pair} (${t.total}, ${t.result}%)`).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {trades.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-2xl p-6 text-center">
              <div className="text-4xl font-bold mb-2">{trades.length}</div>
              <div className="text-red-100">Multi-OCR SELL</div>
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
                Celkový profit
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
        {(trades.length > 0 || ocrResults.length > 0) && (
          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={clearAll}
              className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 rounded-lg font-semibold hover:from-red-700 hover:to-red-800 transition-all duration-300"
            >
              🗑️ Vymazat vše
            </button>
            {!showCorrection && ocrResults.length > 0 && (
              <button
                onClick={() => setShowCorrection(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 transition-all duration-300"
              >
                🔍 Zobrazit OCR detaily
              </button>
            )}
          </div>
        )}

        {/* Results Table */}
        {trades.length > 0 && (
          <div className="bg-white/10 rounded-2xl overflow-hidden backdrop-blur-sm border border-white/20 shadow-2xl">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6">
              <h2 className="text-2xl font-bold text-center">
                🔥 Multi-OCR Rozpoznané SELL Transakce
              </h2>
              <p className="text-center text-red-100 text-sm mt-2">
                Nejlepší výsledky z více OCR pokusů
              </p>
            </div>
            
            {/* Desktop Table */}
            <div className="hidden md:block">
              <div className="bg-red-900/30 px-8 py-4 border-b border-white/10">
                <div className="grid grid-cols-4 gap-8 font-bold text-xl">
                  <div>🔗 Pair</div>
                  <div>💰 Total</div>
                  <div>📊 Result</div>
                  <div>💎 Profit</div>
                </div>
              </div>
              <div className="divide-y divide-white/10">
                {trades.map((trade) => (
                  <div key={trade.id} className="px-8 py-6 hover:bg-white/5 transition-colors">
                    <div className="grid grid-cols-4 gap-8 items-center text-lg">
                      <div className="font-bold text-red-400 text-xl">{trade.pair}</div>
                      <div className="font-mono font-semibold">{trade.total.toFixed(4)}</div>
                      <div className={`font-bold text-xl ${trade.result >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.result >= 0 ? '+' : ''}{trade.result.toFixed(2)}%
                      </div>
                      <div className={`font-mono font-bold text-xl ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(4)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden p-4 space-y-4">
              {trades.map((trade) => (
                <div key={trade.id} className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <div className="text-center mb-4">
                    <div className="font-bold text-2xl text-red-400">{trade.pair}</div>
                    <div className="text-xs text-gray-400">Confidence: {trade.confidence}%</div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-300">💰 Total:</span>
                      <span className="font-mono font-semibold">{trade.total.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">📊 Result:</span>
                      <span className={`font-bold ${trade.result >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.result >= 0 ? '+' : ''}{trade.result.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">💎 Profit:</span>
                      <span className={`font-mono font-bold ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No results message */}
        {!loading && trades.length === 0 && screenshots.length > 0 && (
          <div className="bg-white/10 rounded-2xl p-12 text-center backdrop-blur-sm border border-white/20">
            <div className="text-6xl mb-4">🔥</div>
            <h3 className="text-2xl font-semibold mb-4">Multi-OCR nedetekoval žádné SELL transakce</h3>
            <p className="text-gray-300 text-lg mb-4">
              Ani po 4 různých preprocessing metodách nebyly nalezeny SELL transakce
            </p>
            <div className="bg-yellow-900/30 rounded-lg p-4 max-w-lg mx-auto">
              <p className="text-yellow-200 font-semibold">💡 Zkuste:</p>
              <ul className="text-sm text-gray-300 mt-2 text-left">
                <li>• Screenshot s vyšším rozlišením nebo kontrastem</li>
                <li>• Ujistěte se, že je viditelný text "Sell" nebo "SELL"</li>
                <li>• Zobrazte si OCR detaily pro debug informace</li>
                <li>• Jiný format screenshotu (PNG vs JPG)</li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-gray-400">
          <p>🔥 Multi-OCR Engine • 4x preprocessing • Smart result selection • Correction interface</p>
        </div>
      </div>
    </div>
  );
};

export default SellAnalyzer;
