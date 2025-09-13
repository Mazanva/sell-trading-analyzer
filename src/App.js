import React, { useState } from "react";
import { createWorker } from "tesseract.js";

function App() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [progress, setProgress] = useState(0);

  // Parse SELL transactions from OCR text
  const parseSellTransactions = (text) => {
    const lines = text.split("\n");
    const sellTrades = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Look for lines containing "Sell" or "SELL"
      if (line.toLowerCase().includes("sell")) {
        try {
          // Try to extract trading pair, date, total, and result
          const nextLines = lines.slice(i, i + 5).join(" ");

          // Pattern matching for different formats
          const pairMatch = nextLines.match(/([A-Z]{2,10}\/USDT)/);
          const dateMatch = nextLines.match(/(\d{2}-\d{2})/);
          const totalMatch = nextLines.match(/(\d+\.?\d*)/g);
          const percentMatch = nextLines.match(/(\d+\.?\d*)%/);

          if (pairMatch && dateMatch && totalMatch && percentMatch) {
            const pair = pairMatch[1];
            const date = `2025-${dateMatch[1]}`;
            const total = parseFloat(
              totalMatch[totalMatch.length - 2] || totalMatch[0]
            );
            const result = parseFloat(percentMatch[0].replace("%", ""));
            const profit = (total * result) / 100;

            sellTrades.push({
              id: Date.now() + Math.random(),
              pair,
              date,
              total,
              result,
              profit,
            });
          }
        } catch (error) {
          console.log("Error parsing line:", line, error);
        }
      }
    }

    return sellTrades;
  };

  // Handle file upload and OCR processing
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    setLoading(true);
    setProgress(0);

    const reader = new FileReader();
    reader.onload = async (event) => {
      setScreenshot(event.target.result);

      try {
        // Initialize Tesseract worker
        const worker = await createWorker("eng", 1, {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(Math.round(m.progress * 100));
            }
          },
        });

        // Recognize text from image
        const {
          data: { text },
        } = await worker.recognize(event.target.result);
        console.log("OCR Text:", text);

        // Parse SELL transactions
        const sellTrades = parseSellTransactions(text);
        setTrades(sellTrades);

        await worker.terminate();
      } catch (error) {
        console.error("OCR Error:", error);
        alert("Chyba při rozpoznávání textu. Zkuste jiný screenshot.");
      } finally {
        setLoading(false);
        setProgress(0);
      }
    };

    reader.readAsDataURL(file);
  };

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add("border-red-400", "bg-red-900/20");
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("border-red-400", "bg-red-900/20");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("border-red-400", "bg-red-900/20");
    handleFileUpload(e);
  };

  // Calculate summary stats
  const totalProfit = trades.reduce((sum, trade) => sum + trade.profit, 0);
  const avgResult =
    trades.length > 0
      ? trades.reduce((sum, trade) => sum + trade.result, 0) / trades.length
      : 0;
  const totalAmount = trades.reduce((sum, trade) => sum + trade.total, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
            🔴 SELL Analyzer
          </h1>
          <p className="text-xl text-gray-300">
            Nahrajte screenshot → Automaticky najde SELL → Vytvoří tabulku
          </p>
        </div>

        {/* Upload Section */}
        <div className="bg-white/10 rounded-2xl p-8 mb-8 backdrop-blur-sm border border-white/20">
          <div
            className="border-2 border-dashed border-red-500 rounded-xl p-16 text-center cursor-pointer transition-all duration-300 hover:border-red-400 hover:bg-red-900/10"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById("fileInput").click()}
          >
            {loading ? (
              <div className="space-y-4">
                <div className="text-6xl animate-spin">⚙️</div>
                <h3 className="text-2xl font-semibold">Rozpoznávám text...</h3>
                <div className="w-full bg-gray-700 rounded-full h-3">
                  <div
                    className="bg-gradient-to-r from-red-500 to-red-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <p className="text-gray-300">{progress}% hotovo</p>
              </div>
            ) : (
              <div>
                <div className="text-8xl mb-6">📱</div>
                <h3 className="text-2xl font-semibold mb-4">
                  Nahrajte screenshot trading botu
                </h3>
                <p className="text-gray-300 text-lg">
                  Aplikace automaticky najde všechny SELL transakce a vytvoří
                  tabulku
                </p>
                <p className="text-gray-400 mt-2">
                  Klikněte zde nebo přetáhněte obrázek
                </p>
              </div>
            )}
            <input
              type="file"
              id="fileInput"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={loading}
            />
          </div>

          {screenshot && !loading && (
            <div className="mt-8 text-center">
              <h4 className="text-lg font-semibold mb-4">
                Nahraný screenshot:
              </h4>
              <img
                src={screenshot}
                alt="Screenshot"
                className="max-w-full max-h-96 mx-auto rounded-lg shadow-2xl border border-white/20"
              />
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
              <div className="text-4xl font-bold mb-2">
                {totalAmount.toFixed(2)}
              </div>
              <div className="text-blue-100">Total USDT</div>
            </div>
            <div
              className={`bg-gradient-to-r ${
                totalProfit >= 0
                  ? "from-green-600 to-green-700"
                  : "from-red-600 to-red-700"
              } rounded-2xl p-6 text-center`}
            >
              <div className="text-4xl font-bold mb-2">
                {totalProfit >= 0 ? "+" : ""}
                {totalProfit.toFixed(4)}
              </div>
              <div
                className={totalProfit >= 0 ? "text-green-100" : "text-red-100"}
              >
                Celkový profit USDT
              </div>
            </div>
            <div
              className={`bg-gradient-to-r ${
                avgResult >= 0
                  ? "from-green-600 to-green-700"
                  : "from-red-600 to-red-700"
              } rounded-2xl p-6 text-center`}
            >
              <div className="text-4xl font-bold mb-2">
                {avgResult >= 0 ? "+" : ""}
                {avgResult.toFixed(2)}%
              </div>
              <div
                className={avgResult >= 0 ? "text-green-100" : "text-red-100"}
              >
                Průměrný result
              </div>
            </div>
          </div>
        )}

        {/* Results Table */}
        {trades.length > 0 && (
          <div className="bg-white/10 rounded-2xl overflow-hidden backdrop-blur-sm border border-white/20 shadow-2xl">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6">
              <h2 className="text-2xl font-bold text-center">
                🔴 SELL Transakce - Automaticky rozpoznané
              </h2>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block">
              <div className="bg-red-900/30 px-8 py-4 border-b border-white/10">
                <div className="grid grid-cols-5 gap-6 font-bold text-lg">
                  <div>Pár</div>
                  <div>Datum</div>
                  <div>Total</div>
                  <div>Result</div>
                  <div>Profit</div>
                </div>
              </div>
              <div className="divide-y divide-white/10">
                {trades.map((trade, index) => (
                  <div
                    key={trade.id}
                    className="px-8 py-6 hover:bg-white/5 transition-colors"
                  >
                    <div className="grid grid-cols-5 gap-6 items-center text-lg">
                      <div className="font-bold text-red-400">{trade.pair}</div>
                      <div className="text-gray-300">{trade.date}</div>
                      <div className="font-mono font-semibold">
                        {trade.total.toFixed(4)}
                      </div>
                      <div
                        className={`font-bold text-xl ${
                          trade.result >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {trade.result >= 0 ? "+" : ""}
                        {trade.result.toFixed(2)}%
                      </div>
                      <div
                        className={`font-mono font-bold text-xl ${
                          trade.profit >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {trade.profit >= 0 ? "+" : ""}
                        {trade.profit.toFixed(4)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden p-4 space-y-4">
              {trades.map((trade, index) => (
                <div
                  key={trade.id}
                  className="bg-white/5 rounded-xl p-6 border border-white/10"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="font-bold text-xl text-red-400">
                      {trade.pair}
                    </div>
                    <div className="text-gray-400">{trade.date}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Total:</span>
                      <span className="font-mono font-semibold">
                        {trade.total.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Result:</span>
                      <span
                        className={`font-bold ${
                          trade.result >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {trade.result >= 0 ? "+" : ""}
                        {trade.result.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Profit:</span>
                      <span
                        className={`font-mono font-bold ${
                          trade.profit >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {trade.profit >= 0 ? "+" : ""}
                        {trade.profit.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No results message */}
        {!loading && trades.length === 0 && screenshot && (
          <div className="bg-white/10 rounded-2xl p-12 text-center backdrop-blur-sm border border-white/20">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-2xl font-semibold mb-4">
              Žádné SELL transakce nenalezeny
            </h3>
            <p className="text-gray-300 text-lg">
              Zkuste nahrát jiný screenshot nebo zkontrolujte, zda obsahuje SELL
              transakce
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-gray-400">
          <p>🚀 Automatické rozpoznávání pomocí OCR technologie</p>
        </div>
      </div>
    </div>
  );
}

export default App;
