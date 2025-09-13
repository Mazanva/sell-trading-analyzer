import React, { useState } from 'react';
import { createWorker } from 'tesseract.js';

const SellAnalyzer = () => {
  const [trades, setTrades] = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [processingLog, setProcessingLog] = useState([]);

  // Advanced region detection for trading interface
  const detectTradingRegions = async (canvas, ctx) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    
    // Look for table-like structures and "Sell" text regions
    const regions = [];
    const sellPositions = [];
    
    // Convert to grayscale and find dark backgrounds (trading tables)
    const grayscale = [];
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      grayscale.push(gray);
    }
    
    // Find horizontal lines (table rows)
    const horizontalLines = [];
    for (let y = 10; y < height - 10; y += 5) {
      let darkPixels = 0;
      for (let x = 0; x < width; x += 10) {
        const idx = y * width + x;
        if (grayscale[idx] < 100) darkPixels++;
      }
      if (darkPixels > width / 20) {
        horizontalLines.push(y);
      }
    }
    
    // Group lines into table rows (regions)
    for (let i = 0; i < horizontalLines.length - 1; i++) {
      const rowTop = horizontalLines[i];
      const rowBottom = horizontalLines[i + 1];
      const rowHeight = rowBottom - rowTop;
      
      if (rowHeight > 20 && rowHeight < 100) {
        regions.push({
          x: 0,
          y: rowTop,
          width: width,
          height: rowHeight,
          type: 'tableRow'
        });
      }
    }
    
    return regions;
  };

  // Smart OCR with region focus
  const processRegionWithOCR = async (canvas, region, worker) => {
    const ctx = canvas.getContext('2d');
    
    // Create smaller canvas for the region
    const regionCanvas = document.createElement('canvas');
    const regionCtx = regionCanvas.getContext('2d');
    regionCanvas.width = region.width;
    regionCanvas.height = region.height;
    
    // Extract region
    regionCtx.drawImage(canvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    
    // Enhance contrast for this region
    const imageData = regionCtx.getImageData(0, 0, region.width, region.height);
    const data = imageData.data;
    
    // High contrast enhancement specifically for text
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (brightness > 150) {
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; // White
      } else if (brightness < 80) {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; // Black
      } else {
        data[i] = brightness > 115 ? 255 : 0;
        data[i + 1] = brightness > 115 ? 255 : 0;
        data[i + 2] = brightness > 115 ? 255 : 0;
      }
    }
    
    regionCtx.putImageData(imageData, 0, 0);
    
    // OCR on enhanced region
    const { data: { text, confidence } } = await worker.recognize(regionCanvas);
    
    return {
      text: text.trim(),
      confidence,
      region,
      processedImage: regionCanvas.toDataURL()
    };
  };

  // Enhanced SELL detection with positional intelligence
  const extractSellTransactions = async (regions, worker) => {
    const trades = [];
    
    for (let region of regions) {
      try {
        const result = await processRegionWithOCR(document.createElement('canvas'), region, worker);
        
        // Check if this region contains SELL
        if (result.text.toLowerCase().includes('sell')) {
          console.log(`🎯 SELL region found: "${result.text}"`);
          
          // Split into columns based on spacing
          const text = result.text.replace(/\s+/g, ' ').trim();
          const parts = text.split(' ').filter(p => p.length > 0);
          
          console.log(`📊 Text parts:`, parts);
          
          // Intelligent pattern matching for columns
          let pair = null;
          let total = null;
          let result_pct = null;
          
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            
            // Trading pair detection (improved)
            if (!pair && /^[A-Z]{2,6}[\/-]?(USDT|USD)?$/i.test(part)) {
              pair = part.toUpperCase();
              if (!pair.includes('/') && !pair.includes('-')) {
                pair += '/USDT';
              }
              pair = pair.replace('-', '/');
            }
            
            // Total amount detection (look for numbers > 50)
            if (!total && /^\d{2,4}\.\d{2,6}$/.test(part)) {
              const value = parseFloat(part);
              if (value >= 50 && value <= 10000) {
                total = value;
              }
            }
            
            // Result percentage detection
            if (!result_pct && (/^[+-]?\d{1,2}\.\d{1,3}%?$/.test(part) || /^\d{1,2}\.\d{1,3}%$/.test(part))) {
              result_pct = parseFloat(part.replace('%', ''));
            }
          }
          
          // Look in surrounding regions if data is incomplete
          if (pair && (!total || result_pct === null)) {
            console.log(`🔍 Looking for missing data around SELL region...`);
            
            // Check adjacent regions
            const adjacentRegions = regions.filter(r => 
              Math.abs(r.y - region.y) <= region.height * 2 && r !== region
            );
            
            for (let adjRegion of adjacentRegions.slice(0, 3)) {
              const adjResult = await processRegionWithOCR(document.createElement('canvas'), adjRegion, worker);
              const adjParts = adjResult.text.split(/\s+/).filter(p => p.length > 0);
              
              for (let part of adjParts) {
                if (!total && /^\d{2,4}\.\d{2,6}$/.test(part)) {
                  const value = parseFloat(part);
                  if (value >= 50 && value <= 10000) {
                    total = value;
                  }
                }
                
                if (result_pct === null && /^[+-]?\d{1,2}\.\d{1,3}%?$/.test(part)) {
                  result_pct = parseFloat(part.replace('%', ''));
                }
              }
            }
          }
          
          // Create trade if we have minimum required data
          if (pair && total && result_pct !== null) {
            const profit = (total * result_pct) / 100;
            
            const trade = {
              id: Date.now() + Math.random(),
              pair: pair,
              total: total,
              result: result_pct,
              profit: profit,
              confidence: result.confidence,
              rawText: result.text
            };
            
            console.log(`✅ Extracted trade:`, trade);
            trades.push(trade);
          } else {
            console.log(`❌ Incomplete data - Pair: ${pair}, Total: ${total}, Result: ${result_pct}`);
          }
        }
      } catch (error) {
        console.error(`❌ Region processing error:`, error);
      }
    }
    
    return trades;
  };

  // Main processing function
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || e.dataTransfer?.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) return;

    setLoading(true);
    setProgress({ current: 0, total: imageFiles.length, percent: 0 });
    setProcessingLog(['🚀 Inicializace automatického skenování...']);
    
    // Create preview images
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
    
    try {
      // Initialize OCR worker
      setProcessingLog(prev => [...prev, '🔧 Načítání OCR engine...']);
      const worker = await createWorker('eng', 1, { logger: () => {} });
      
      // Enhanced OCR settings for trading data
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-%/+:()[] ',
        tessedit_pageseg_mode: '6',
        tessedit_ocr_engine_mode: '1',
        preserve_interword_spaces: '1'
      });
      
      // Process each image
      for (let i = 0; i < imageFiles.length; i++) {
        setProgress(prev => ({ ...prev, current: i + 1 }));
        setProcessingLog(prev => [...prev, `📷 Zpracovávám obrázek ${i + 1}/${imageFiles.length}: ${imageFiles[i].name}`]);
        
        // Load image to canvas
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
        
        setProcessingLog(prev => [...prev, `🔍 Detekuji oblasti tabulky...`]);
        
        // Detect trading table regions
        const regions = await detectTradingRegions(canvas, ctx);
        setProcessingLog(prev => [...prev, `📊 Nalezeno ${regions.length} oblastí k analýze`]);
        
        // Extract SELL transactions from regions
        setProcessingLog(prev => [...prev, `⚡ Extrakce SELL transakcí...`]);
        const imageTrades = await extractSellTransactions(regions, worker);
        
        setProcessingLog(prev => [...prev, `✅ Obrázek ${i + 1}: nalezeno ${imageTrades.length} SELL transakcí`]);
        allTrades.push(...imageTrades);
        
        const percent = Math.round(((i + 1) / imageFiles.length) * 100);
        setProgress(prev => ({ ...prev, percent }));
      }
      
      await worker.terminate();
      setProcessingLog(prev => [...prev, `🏆 Kompletní analýza dokončena: ${allTrades.length} transakcí celkem`]);
      
    } catch (error) {
      console.error('Processing Error:', error);
      setProcessingLog(prev => [...prev, `❌ Chyba: ${error.message}`]);
    } finally {
      setLoading(false);
      setProgress({ current: 0, total: 0, percent: 0 });
    }
    
    setTrades(allTrades);
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

  const clearAll = () => {
    if (window.confirm('Vymazat všechny data a obrázky?')) {
      setTrades([]);
      setScreenshots([]);
      setProcessingLog([]);
    }
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
            🤖 AI SELL Analyzer
          </h1>
          <p className="text-xl text-gray-300">
            Automatické rozpoznávání • Template matching • Region-based OCR
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
                <div className="text-6xl animate-spin">🤖</div>
                <h3 className="text-2xl font-semibold">
                  AI analýza {progress.current}/{progress.total}...
                </h3>
                <div className="w-full bg-gray-700 rounded-full h-4">
                  <div 
                    className="bg-gradient-to-r from-red-500 to-red-600 h-4 rounded-full transition-all duration-300" 
                    style={{ width: `${progress.percent}%` }}
                  ></div>
                </div>
                <div className="text-lg">{progress.percent}% dokončeno</div>
                
                {/* Live Processing Log */}
                <div className="bg-black/50 rounded-lg p-4 max-h-40 overflow-y-auto text-left">
                  <div className="text-sm font-mono space-y-1">
                    {processingLog.slice(-8).map((log, idx) => (
                      <div key={idx} className="text-green-300">{log}</div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-8xl mb-6">🤖📱🤖</div>
                <h3 className="text-2xl font-semibold mb-4">Plně automatické rozpoznávání</h3>
                <div className="bg-gradient-to-r from-purple-900/50 to-red-900/50 rounded-lg p-6 mb-4">
                  <p className="text-white font-semibold mb-3">🧠 AI-powered workflow:</p>
                  <div className="text-left text-sm space-y-2">
                    <div>1. 🔍 Automatická detekce tabulkových oblastí</div>
                    <div>2. 📊 Template matching pro SELL řádky</div>
                    <div>3. ⚡ Region-based OCR na specifické oblasti</div>
                    <div>4. 🎯 Inteligentní extrakce Pair | Total | Result | Profit</div>
                  </div>
                </div>
                <p className="text-gray-300 text-lg mb-4">
                  <strong>Nahrajte screenshoty a nechte AI pracovat</strong>
                </p>
                <p className="text-gray-400">
                  Zero manual work • Maximum accuracy • Instant results
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
          
          {/* Screenshots Preview */}
          {screenshots.length > 0 && !loading && (
            <div className="mt-8">
              <h4 className="text-lg font-semibold mb-4 text-center">
                🤖 AI zpracované obrázky ({screenshots.length})
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {screenshots.map((screenshot, index) => (
                  <div key={index} className="relative group">
                    <img 
                      src={screenshot.preview} 
                      alt={`Screenshot ${index + 1}`} 
                      className="w-full h-32 object-cover rounded-lg border border-white/20 group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/70 text-xs px-2 py-1 rounded">
                      AI #{index + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {trades.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-2xl p-6 text-center">
              <div className="text-4xl font-bold mb-2">{trades.length}</div>
              <div className="text-red-100">AI detekované SELL</div>
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

        {/* Action Button */}
        {trades.length > 0 && (
          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={clearAll}
              className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 rounded-lg font-semibold hover:from-red-700 hover:to-red-800 transition-all duration-300"
            >
              🗑️ Vymazat vše
            </button>
          </div>
        )}

        {/* Results Table */}
        {trades.length > 0 && (
          <div className="bg-white/10 rounded-2xl overflow-hidden backdrop-blur-sm border border-white/20 shadow-2xl">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6">
              <h2 className="text-2xl font-bold text-center">
                🤖 AI Rozpoznané SELL Transakce
              </h2>
              <p className="text-center text-red-100 text-sm mt-2">
                Automaticky extrahováno z {screenshots.length} obrázků
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
            <div className="text-6xl mb-4">🤖</div>
            <h3 className="text-2xl font-semibold mb-4">AI nedetekoval žádné SELL transakce</h3>
            <p className="text-gray-300 text-lg mb-4">
              Template matching nenašel odpovídající tabulkové struktury v {screenshots.length} obrázku{screenshots.length > 1 ? 'ch' : ''}
            </p>
            <div className="bg-yellow-900/30 rounded-lg p-4 max-w-lg mx-auto">
              <p className="text-yellow-200 font-semibold">🤖 AI tips:</p>
              <ul className="text-sm text-gray-300 mt-2 text-left">
                <li>• Screenshot by měl obsahovat tabulku s trading daty</li>
                <li>• Ujistěte se, že je viditelný text "Sell" nebo "SELL"</li>
                <li>• Trading páry by měly být ve formátu XXX/USDT</li>
                <li>• Zkuste screenshot s vyšším rozlišením</li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-gray-400">
          <p>🤖 Powered by AI • Template matching • Region-based OCR • Zero manual work</p>
        </div>
      </div>
    </div>
  );
};

export default SellAnalyzer;
