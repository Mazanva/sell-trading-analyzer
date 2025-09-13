import React, { useState } from 'react';
import { createWorker } from 'tesseract.js';

const SellAnalyzer = () => {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [screenshots, setScreenshots] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [processedImages, setProcessedImages] = useState(0);

  // Color-based image preprocessing for better OCR
  const preprocessImage = (canvas, ctx, imageData) => {
    const data = imageData.data;
    
    // Target colors
    const targetBackground = { r: 0x1a, g: 0x18, b: 0x48 }; // #1a1848
    const targetText = { r: 0xdd, g: 0xde, b: 0xe1 }; // #dddee1
    const targetProfit = { r: 0x19, g: 0x7e, b: 0x77 }; // #197e77
    
    // Color distance function
    const colorDistance = (c1, c2) => {
      return Math.sqrt(
        Math.pow(c1.r - c2.r, 2) + 
        Math.pow(c1.g - c2.g, 2) + 
        Math.pow(c1.b - c2.b, 2)
      );
    };

    // Process each pixel
    for (let i = 0; i < data.length; i += 4) {
      const pixel = { r: data[i], g: data[i + 1], b: data[i + 2] };
      
      // Check if pixel matches target colors (with tolerance)
      const bgDistance = colorDistance(pixel, targetBackground);
      const textDistance = colorDistance(pixel, targetText);
      const profitDistance = colorDistance(pixel, targetProfit);
      
      // High contrast enhancement for target regions
      if (bgDistance < 50) {
        // Dark background - make it darker
        data[i] = 0;     // R
        data[i + 1] = 0; // G
        data[i + 2] = 0; // B
      } else if (textDistance < 60 || profitDistance < 60) {
        // Text colors - make them white for better OCR
        data[i] = 255;     // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
      } else {
        // Other colors - make them darker to reduce noise
        data[i] = Math.max(0, data[i] - 50);
        data[i + 1] = Math.max(0, data[i + 1] - 50);
        data[i + 2] = Math.max(0, data[i + 2] - 50);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  };

  // Enhanced SELL parser focused on visual context
  const parseSellTransactions = (text, imageIndex) => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 2);
    const sellTrades = [];
    
    console.log(`🔍 Processing image ${imageIndex + 1}, extracted ${lines.length} text lines`);
    
    // Look for SELL transaction patterns
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i].toLowerCase();
      
      // Multiple SELL detection patterns
      if (currentLine.includes('sell') || currentLine.includes('prodej') || currentLine.includes('prodat')) {
        try {
          // Get wider context for better parsing
          const contextStart = Math.max(0, i - 3);
          const contextEnd = Math.min(lines.length, i + 6);
          const contextLines = lines.slice(contextStart, contextEnd);
          const fullContext = contextLines.join(' ');
          
          console.log(`💰 SELL context found: "${fullContext.substring(0, 150)}..."`);
          
          // Enhanced patterns for better matching
          const patterns = {
            // Trading pairs - multiple formats
            pair: [
              /([A-Z]{2,6})\/USDT/gi,
              /([A-Z]{2,6})\/USD/gi, 
              /([A-Z]{2,6})-USDT/gi,
              /([A-Z]{3,6})\s*\/\s*(USDT|USD)/gi,
              /(SQR|ALGO|BONK|DOGE|SHIB|ETC|OP).*?USDT/gi
            ],
            
            // Total amounts - focus on realistic trading amounts
            total: [
              /(\d{2,4}\.\d{2,6})\s*USDT/gi,
              /Total[:\s]*(\d{2,4}\.\d{1,6})/gi,
              /(\d{2,4}\.\d{4,6})/g,
              /(\d{3,4}\.\d+)/g
            ],
            
            // Result percentages with signs
            result: [
              /([+-]?\d{1,2}\.\d{1,3})\s*%/g,
              /Result[:\s]*([+-]?\d{1,2}\.\d{1,3})%/gi,
              /([+-]\d+\.\d+)%/g,
              /([\d.]+)%/g
            ]
          };

          let pair = null;
          let total = null;
          let result = null;

          // Find trading pair with priority
          for (const pattern of patterns.pair) {
            const matches = [...fullContext.matchAll(pattern)];
            if (matches.length > 0) {
              let foundPair = matches[0][1];
              if (matches[0][2]) {
                foundPair += '/' + matches[0][2];
              } else if (!foundPair.includes('/')) {
                foundPair += '/USDT';
              }
              pair = foundPair.toUpperCase();
              break;
            }
          }

          // Find total amount - filter realistic values
          for (const pattern of patterns.total) {
            const matches = [...fullContext.matchAll(pattern)];
            for (const match of matches) {
              const value = parseFloat(match[1]);
              if (value >= 50 && value <= 10000) { // Realistic trading range
                total = value;
                break;
              }
            }
            if (total) break;
          }

          // Find result percentage
          for (const pattern of patterns.result) {
            const matches = [...fullContext.matchAll(pattern)];
            if (matches.length > 0) {
              let value = parseFloat(matches[0][1]);
              // Handle cases where sign might be separate
              if (fullContext.includes('-') && value > 0) {
                value = -value;
              }
              if (value >= -50 && value <= 50) { // Realistic % range
                result = value;
                break;
              }
            }
          }

          // Create trade if we have complete data
          if (pair && total && result !== null) {
            const profit = (total * result) / 100;
            
            const trade = {
              id: Date.now() + Math.random() + imageIndex,
              pair: pair,
              total: total,
              result: result,
              profit: profit
            };
            
            console.log(`✅ Created trade: ${pair} | ${total} | ${result}% | ${profit.toFixed(4)}`);
            sellTrades.push(trade);
          } else {
            console.log(`❌ Incomplete: Pair=${pair}, Total=${total}, Result=${result}`);
          }
          
        } catch (error) {
          console.error('❌ Parsing error:', error);
        }
      }
    }
    
    console.log(`📊 Image ${imageIndex + 1}: Found ${sellTrades.length} complete SELL trades`);
    return sellTrades;
  };

  // Handle multiple file upload with preprocessing
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || e.dataTransfer?.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) return;

    setLoading(true);
    setProgress({ current: 0, total: imageFiles.length, percent: 0 });
    setProcessedImages(0);
    
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
    
    // Process images with OCR
    const allTrades = [];
    
    try {
      // Initialize OCR worker with optimized settings
      const worker = await createWorker('eng', 1, {
        logger: () => {}
      });
      
      // Configure OCR for trading interfaces
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-%/+:()[] ',
        tessedit_pageseg_mode: '6', // Single uniform block
        tessedit_ocr_engine_mode: '1', // LSTM OCR engine only
      });

      // Process each image
      for (let i = 0; i < imageFiles.length; i++) {
        setProgress(prev => ({ ...prev, current: i + 1 }));
        setProcessedImages(i);
        
        console.log(`🔄 Processing ${i + 1}/${imageFiles.length}: ${imageFiles[i].name}`);
        
        // Load and preprocess image
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        await new Promise((resolve) => {
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            // Apply color-based preprocessing
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const processedDataUrl = preprocessImage(canvas, ctx, imageData);
            
            resolve(processedDataUrl);
          };
          img.src = screenshotPreviews[i].preview;
        });
        
        // OCR with preprocessed image
        const { data: { text, confidence } } = await worker.recognize(canvas.toDataURL());
        console.log(`🎯 OCR confidence: ${confidence}% for ${imageFiles[i].name}`);
        
        // Parse trades from OCR text
        const imageTrades = parseSellTransactions(text, i);
        allTrades.push(...imageTrades);
        
        // Update progress
        const percent = Math.round(((i + 1) / imageFiles.length) * 100);
        setProgress(prev => ({ ...prev, percent }));
      }
      
      await worker.terminate();
      console.log(`🏆 Total trades extracted: ${allTrades.length}`);
      
    } catch (error) {
      console.error('💥 OCR Error:', error);
      alert(`Chyba při zpracování: ${error.message}`);
    } finally {
      setLoading(false);
      setProgress({ current: 0, total: 0, percent: 0 });
      setProcessedImages(0);
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

  // Clear data
  const clearAll = () => {
    if (window.confirm('Vymazat všechny data a obrázky?')) {
      setTrades([]);
      setScreenshots([]);
    }
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
            🎯 SELL Analyzer Pro
          </h1>
          <p className="text-xl text-gray-300">
            Color-targeted OCR • Multi-upload • Přesná data extrakce
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
                <div className="text-6xl animate-spin">🎯</div>
                <h3 className="text-2xl font-semibold">
                  Zpracovávám {progress.current}/{progress.total} s color detection...
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
                    🔍 Analyzuji barvy: {screenshots[processedImages].name}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="text-8xl mb-6">🎯📱🎯</div>
                <h3 className="text-2xl font-semibold mb-4">Color-targeted OCR Scanner</h3>
                <div className="bg-gradient-to-r from-blue-900/50 to-green-900/50 rounded-lg p-6 mb-4">
                  <p className="text-white font-semibold mb-3">🎨 Optimalizováno pro barvy:</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded" style={{backgroundColor: '#1a1848'}}></div>
                      <span>Pozadí polí</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded" style={{backgroundColor: '#dddee1'}}></div>
                      <span>Běžný text</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded" style={{backgroundColor: '#197e77'}}></div>
                      <span>Profit text</span>
                    </div>
                  </div>
                </div>
                <p className="text-gray-300 text-lg mb-4">
                  Inteligentní rozpoznávání: <strong>Pair • Total • Result • Profit</strong>
                </p>
                <p className="text-gray-400">
                  Nahrajte více trading screenshotů současně
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
                      #{index + 1}
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

        {/* Clean Results Table - Only 4 columns */}
        {trades.length > 0 && (
          <div className="bg-white/10 rounded-2xl overflow-hidden backdrop-blur-sm border border-white/20 shadow-2xl">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6">
              <h2 className="text-2xl font-bold text-center">
                🎯 SELL Transakce - Color-targeted OCR
              </h2>
              <p className="text-center text-red-100 text-sm mt-2">
                {screenshots.length} obrázků • {trades.length} SELL transakcí
              </p>
            </div>
            
            {/* Desktop Table - Clean 4 columns */}
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
                      <div className="font-mono font-semibold text-lg">{trade.total.toFixed(4)}</div>
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

            {/* Mobile Cards - Clean version */}
            <div className="md:hidden p-4 space-y-4">
              {trades.map((trade) => (
                <div key={trade.id} className="bg-white/5 rounded-xl p-6 border border-white/10">
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

        {/* No results message */}
        {!loading && trades.length === 0 && screenshots.length > 0 && (
          <div className="bg-white/10 rounded-2xl p-12 text-center backdrop-blur-sm border border-white/20">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-2xl font-semibold mb-4">Žádné SELL transakce nenalezeny</h3>
            <p className="text-gray-300 text-lg mb-4">
              Color-targeted OCR nedetekoval SELL transakce v {screenshots.length} obrázku{screenshots.length > 1 ? 'ch' : ''}
            </p>
            <div className="bg-yellow-900/30 rounded-lg p-4 max-w-lg mx-auto">
              <p className="text-yellow-200 font-semibold">💡 Pro lepší výsledky:</p>
              <ul className="text-sm text-gray-300 mt-2 text-left">
                <li>• Ujistěte se, že screenshot obsahuje pole s barvou <span style={{color: '#1a1848'}}>#{`1a1848`}</span></li>
                <li>• Text by měl být ve světlých barvách <span style={{color: '#dddee1'}}>#{`dddee1`}</span></li>
                <li>• Profit text v zelené <span style={{color: '#197e77'}}>#{`197e77`}</span></li>
                <li>• Zajistěte dobrý kontrast a čitelnost</li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-gray-400">
          <p>🎯 Color-targeted OCR • Optimalizováno pro trading interface • Čistá 4-column tabulka</p>
        </div>
      </div>
    </div>
  );
};

export default SellAnalyzer;
