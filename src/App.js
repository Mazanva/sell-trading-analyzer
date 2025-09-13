import React, { useState } from 'react';
import { createWorker } from 'tesseract.js';

const SellAnalyzer = () => {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [screenshots, setScreenshots] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [processedImages, setProcessedImages] = useState(0);

  // Enhanced SELL transaction parser focused on key data
  const parseSellTransactions = (text, imageIndex) => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const sellTrades = [];
    
    console.log(`Processing image ${imageIndex + 1}, found ${lines.length} lines`);
    
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      
      // Look specifically for SELL transactions
      if (currentLine.toLowerCase().includes('sell') || currentLine.toLowerCase().includes('prodej')) {
        try {
          // Get context lines around the sell line for better parsing
          const contextLines = lines.slice(Math.max(0, i - 2), i + 5);
          const contextText = contextLines.join(' ');
          
          console.log(`Found SELL context: ${contextText}`);
          
          // Enhanced regex patterns for better matching
          const pairPatterns = [
            /([A-Z]{2,6}\/USDT)/g,
            /([A-Z]{2,6}\/USD)/g,
            /([A-Z]{2,6}-USDT)/g,
            /([A-Z]{3,6})\/([A-Z]{3,4})/g
          ];
          
          const totalPatterns = [
            /(\d+\.?\d*)\s*USDT/g,
            /Total[:\s]*(\d+\.?\d*)/gi,
            /(\d{2,}\.\d{2,4})/g
          ];
          
          const resultPatterns = [
            /([+-]?\d+\.?\d*)\s*%/g,
            /Result[:\s]*([+-]?\d+\.?\d*)%/gi,
            /([+-]\d+\.\d+)%/g
          ];
          
          let pair = null;
          let total = null;
          let result = null;
          
          // Find trading pair
          for (const pattern of pairPatterns) {
            const matches = [...contextText.matchAll(pattern)];
            if (matches.length > 0) {
              pair = matches[0][1] || `${matches[0][1]}/${matches[0][2]}`;
              if (pair && !pair.includes('/')) {
                pair = pair + '/USDT';
              }
              break;
            }
          }
          
          // Find total amount
          for (const pattern of totalPatterns) {
            const matches = [...contextText.matchAll(pattern)];
            if (matches.length > 0) {
              const value = parseFloat(matches[0][1]);
              if (value > 10) { // Filter out small numbers that aren't totals
                total = value;
                break;
              }
            }
          }
          
          // Find result percentage
          for (const pattern of resultPatterns) {
            const matches = [...contextText.matchAll(pattern)];
            if (matches.length > 0) {
              result = parseFloat(matches[0][1]);
              break;
            }
          }
          
          // If we found all required data, create trade
          if (pair && total && result !== null) {
            const profit = (total * result) / 100;
            
            const trade = {
              id: Date.now() + Math.random() + imageIndex,
              pair: pair.toUpperCase(),
              total: total,
              result: result,
              profit: profit,
              source: `Screenshot ${imageIndex + 1}`,
              rawContext: contextText.substring(0, 100) // For debugging
            };
            
            console.log(`Created trade:`, trade);
            sellTrades.push(trade);
          } else {
            console.log(`Incomplete data - Pair: ${pair}, Total: ${total}, Result: ${result}`);
          }
          
        } catch (error) {
          console.error('Error parsing trade:', error);
        }
      }
    }
    
    console.log(`Image ${imageIndex + 1} processed: ${sellTrades.length} trades found`);
    return sellTrades;
  };

  // Handle multiple file upload
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || e.dataTransfer?.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) return;

    setLoading(true);
    setProgress({ current: 0, total: imageFiles.length, percent: 0 });
    setProcessedImages(0);
    
    // Convert files to preview URLs
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
    
    // Process all images
    const allTrades = [];
    
    try {
      // Initialize Tesseract worker once
      const worker = await createWorker('eng', 1, {
        logger: () => {} // Disable individual progress logging
      });
      
      // Configure OCR for better text recognition
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-%/+:() ',
        tessedit_pageseg_mode: '6', // Single uniform block of text
      });

      for (let i = 0; i < imageFiles.length; i++) {
        setProgress(prev => ({ ...prev, current: i + 1 }));
        setProcessedImages(i);
        
        console.log(`Processing image ${i + 1}/${imageFiles.length}: ${imageFiles[i].name}`);
        
        // Read file as data URL
        const reader = new FileReader();
        const dataUrl = await new Promise((resolve) => {
          reader.onload = (e) => resolve(e.target.result);
          reader.readAsDataURL(imageFiles[i]);
        });
        
        // OCR recognition
        const { data: { text, confidence } } = await worker.recognize(dataUrl);
        console.log(`OCR confidence for image ${i + 1}: ${confidence}%`);
        console.log(`OCR text preview: ${text.substring(0, 200)}...`);
        
        // Parse SELL transactions from this image
        const imageTrades = parseSellTransactions(text, i);
        allTrades.push(...imageTrades);
        
        // Update progress
        const percent = Math.round(((i + 1) / imageFiles.length) * 100);
        setProgress(prev => ({ ...prev, percent }));
      }
      
      await worker.terminate();
      console.log(`Total trades found across all images: ${allTrades.length}`);
      
    } catch (error) {
      console.error('OCR Processing Error:', error);
      alert(`Chyba při zpracování obrázků: ${error.message}`);
    } finally {
      setLoading(false);
      setProgress({ current: 0, total: 0, percent: 0 });
      setProcessedImages(0);
    }
    
    // Update trades state
    setTrades(allTrades);
  };

  // Handle drag and drop for multiple files
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

  // Clear all data
  const clearAll = () => {
    if (window.confirm('Vymazat všechny data a obrázky?')) {
      setTrades([]);
      setScreenshots([]);
    }
  };

  // Calculate summary stats
  const totalProfit = trades.reduce((sum, trade) => sum + trade.profit, 0);
  const avgResult = trades.length > 0 ? trades.reduce((sum, trade) => sum + trade.result, 0) / trades.length : 0;
  const totalAmount = trades.reduce((sum, trade) => sum + trade.total, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
            🔴 SELL Analyzer Pro
          </h1>
          <p className="text-xl text-gray-300">
            Multi-upload → Inteligentní OCR → Přesná data extraction
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
                <div className="text-6xl animate-spin">⚙️</div>
                <h3 className="text-2xl font-semibold">
                  Zpracovávám {progress.current}/{progress.total} obrázků...
                </h3>
                <div className="w-full bg-gray-700 rounded-full h-4">
                  <div 
                    className="bg-gradient-to-r from-red-500 to-red-600 h-4 rounded-full transition-all duration-300" 
                    style={{ width: `${progress.percent}%` }}
                  ></div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-lg">
                  <div>📊 Aktuální: {progress.current}</div>
                  <div>📈 Dokončeno: {progress.percent}%</div>
                </div>
                {screenshots[processedImages] && (
                  <div className="text-sm text-gray-400">
                    Zpracovávám: {screenshots[processedImages].name}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="text-8xl mb-6">📱📱📱</div>
                <h3 className="text-2xl font-semibold mb-4">Nahrajte více screenshotů najednou</h3>
                <p className="text-gray-300 text-lg mb-4">
                  Inteligentní OCR zaměřený na: <strong>Pair • Total • Result • Profit</strong>
                </p>
                <div className="bg-red-900/20 rounded-lg p-4 mb-4">
                  <p className="text-red-200 font-semibold">🎯 Vylepšené rozpoznávání:</p>
                  <p className="text-sm text-gray-300">
                    ✅ Přesná detekce trading párů • ✅ Spolehlivé parsování částek • ✅ Automatický výpočet profitu
                  </p>
                </div>
                <p className="text-gray-400">
                  Klikněte zde nebo přetáhněte více obrázků současně
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
                📷 Nahrané obrázky ({screenshots.length})
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
                      {index + 1}
                    </div>
                    <div className="absolute top-2 right-2 bg-red-600 text-xs px-2 py-1 rounded">
                      {screenshot.name.length > 10 ? 
                        screenshot.name.substring(0, 10) + '...' : 
                        screenshot.name
                      }
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
              🔄 Nový scan
            </button>
          </div>
        )}

        {/* Enhanced Results Table */}
        {trades.length > 0 && (
          <div className="bg-white/10 rounded-2xl overflow-hidden backdrop-blur-sm border border-white/20 shadow-2xl">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6">
              <h2 className="text-2xl font-bold text-center">
                🎯 SELL Transakce - Inteligentně rozpoznané
              </h2>
              <p className="text-center text-red-100 text-sm mt-2">
                Zpracováno {screenshots.length} obrázků • Nalezeno {trades.length} SELL transakcí
              </p>
            </div>
            
            {/* Desktop Table */}
            <div className="hidden md:block">
              <div className="bg-red-900/30 px-8 py-4 border-b border-white/10">
                <div className="grid grid-cols-6 gap-6 font-bold text-lg">
                  <div>🔗 Pair</div>
                  <div>💰 Total</div>
                  <div>📊 Result</div>
                  <div>💎 Profit</div>
                  <div>📷 Zdroj</div>
                  <div>🔍 Debug</div>
                </div>
              </div>
              <div className="divide-y divide-white/10">
                {trades.map((trade) => (
                  <div key={trade.id} className="px-8 py-6 hover:bg-white/5 transition-colors">
                    <div className="grid grid-cols-6 gap-6 items-center text-lg">
                      <div className="font-bold text-red-400">{trade.pair}</div>
                      <div className="font-mono font-semibold">{trade.total.toFixed(4)}</div>
                      <div className={`font-bold text-xl ${trade.result >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.result >= 0 ? '+' : ''}{trade.result.toFixed(2)}%
                      </div>
                      <div className={`font-mono font-bold text-xl ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(4)}
                      </div>
                      <div className="text-gray-400 text-sm">{trade.source}</div>
                      <div className="text-xs text-gray-500 truncate max-w-32" title={trade.rawContext}>
                        {trade.rawContext}
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
                  <div className="flex justify-between items-start mb-4">
                    <div className="font-bold text-xl text-red-400">{trade.pair}</div>
                    <div className="text-gray-400 text-sm">{trade.source}</div>
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
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-2xl font-semibold mb-4">Žádné SELL transakce nenalezeny</h3>
            <p className="text-gray-300 text-lg mb-4">
              Ve {screenshots.length} obrázku{screenshots.length > 1 ? 'ch' : ''} nebyly detekovány žádné SELL transakce
            </p>
            <div className="bg-yellow-900/30 rounded-lg p-4 max-w-lg mx-auto">
              <p className="text-yellow-200 font-semibold">💡 Tipy pro lepší rozpoznávání:</p>
              <ul className="text-sm text-gray-300 mt-2 text-left">
                <li>• Zkontrolujte, že screenshot obsahuje SELL transakce</li>
                <li>• Ujistěte se, že text je čitelný a kontrastní</li>
                <li>• Vyzkoušejte obrázky s vyšším rozlišením</li>
                <li>• Ověřte, že jsou viditelné páry, částky a procenta</li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-gray-400">
          <p>🚀 Vylepšené OCR s multi-upload funkcí • Zaměřeno na přesnost dat</p>
        </div>
      </div>
    </div>
  );
};

export default SellAnalyzer;
