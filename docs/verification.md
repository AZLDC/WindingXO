# 測試與驗證

## 環境

- Python 3.10以上，使用README建立的`.venv`。
- Node.js 22以上及Microsoft Edge，用於主要網頁測試。
- Python視窗整合測試另外使用`tests/requirements.txt`中的Playwright套件。

## 主要自動化檢查

在專案根目錄執行：

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
node tests/avatar_surface_check.mjs
node tests/avatar_pose_check.mjs
node tests/browser_check.mjs
```

| 檢查 | 涵蓋範圍 | 執行方式與限制 |
| --- | --- | --- |
| Python單元測試 | 文字保存、名稱／大小限制、視窗狀態、啟動參數、根目錄入口及上傳包排除規則 | 使用臨時目錄及假視窗，不開啟GUI；Windows缺少符號連結權限時跳過該項測試 |
| `avatar_surface_check.mjs` | 後腦圓弧、左右對稱、前臉／身體控制點保護、細分面數及共用邊 | 直接檢查模型幾何，不啟動瀏覽器 |
| `browser_check.mjs` | 預設文件、保存／另存／衝突、復原與重做、右鍵、Compile／Active、子選單、閒置保存及重登入、框架與關機 | 啟動無視窗Edge，使用獨立臨時瀏覽器設定檔 |
| `catalog_check.py` | Python／瀏覽器JSON索引、舊資料庫升級、掛載及容量、固定消耗、改名取消／重名／草稿、重載保存與列表快取 | 無視窗Edge，臨時文件及瀏覽器設定檔；1280×800、800×600、390×844、640×480長名稱三能力版面稽核與截圖存於`.scratch/local/catalog/` |
| 網頁版面 | 桌面／窄版對話框與選單、圓尺方向／標字／遮擋、模型顯示、800×600開機適配、關機點陣文字及載入前黑屏 | 納入`browser_check.mjs`；字型程式延遲載入的情境以HTTP模式檢查 |

模擬GitHub Pages的`/WindingXO/`子路徑：

```powershell
$env:WINDING_HTTP = "1"
node tests/browser_check.mjs
```

未設定`WINDING_HTTP`時使用`file://`開啟頁面。兩種模式都檢查Loading、登入、桌面、閒置重開機與關機的框架導頁，外層網址保持`index.html`。

`WINDING_PREVIEW_DIR`可指定截圖輸出目錄，未設定時不產生截圖。瀏覽器測試使用虛擬時鐘檢查5秒移動、5秒觸控長按及5分鐘閒置邊界，不需等待實際時間。觸控使用瀏覽器的手機觸控模擬，涵蓋未滿5秒、放開／取消重算、圖案區排除、回到黑色背景重計、PointerEvent與TouchEvent相容路徑，再重新載入確認滑鼠仍可進登入。關機頁另外暫停文字程式的HTTP請求，檢查像素繪製及放大前畫面維持全黑。

Echochrome的`tests/echochrome_flow.mjs`由主瀏覽器測試呼叫，以臨時HTTP站點驗證iframe實際導頁、前後頁與分支截斷、協定／帳密網址拒絕、最小化還原、最大化還原、關閉重開及Angel前景隔離。1280×800與390×844檢查視窗邊界、控制項重疊與裁切，截圖及幾何稽核固定存於`.scratch/local/echochrome/`；此項不受`WINDING_PREVIEW_DIR`控制。

白底搜尋首頁以無視窗瀏覽器點擊搜尋按鈕，確認實際產生Google搜尋新分頁、中文與符號的q參數編碼正確，且原視窗保留首頁。桌面／手機首頁截圖存為home-1280.png、home-390.png，並檢查搜尋框與按鈕未裁切；另驗證上一頁返回首頁與關閉重開清空搜尋詞。不以搜尋分頁成功建立宣稱外部搜尋結果內容已驗證；結果仍受網路、Google服務與瀏覽器設定影響。原生Python容器的新視窗行為需另作實測。

測試站通過只代表iframe導覽與視窗機制可用，不代表Google能嵌入。隔離iframe可能作為獨立瀏覽器程序，實際導頁同時檢查frame tree及iframe target。

## 語法檢查

```powershell
.venv\Scripts\python.exe -m compileall -q native tests tools
node --check assets/js/desktop.js
node --check assets/js/runtime.js
node --check assets/js/angel-visual.js
node --check assets/js/shutdown-text.js
```

HTML中的內嵌JavaScript也屬於語法檢查範圍。

## Python橋接與原生視窗整合

安裝額外測試相依套件後，可執行針對Python橋接的無視窗檢查：

```powershell
.venv\Scripts\python.exe -m pip install -r tests/requirements.txt
.venv\Scripts\python.exe tests/angel_check.py
.venv\Scripts\python.exe tests/editor_check.py
.venv\Scripts\python.exe tests/boot_check.py
.venv\Scripts\python.exe tests/idle_check.py
.venv\Scripts\python.exe tests/compile_check.py
.venv\Scripts\python.exe tests/catalog_check.py
.venv\Scripts\python.exe tests/shutdown_check.py
```

`ui_check.py`與`toy_check.py`是`angel_check.py`的相容入口。

`tests/native_check.py`使用真正Windows WebView2視窗驗證全螢幕、Alt+Enter、框架切頁、JavaScript／Python溝通與磁碟保存。此測試會顯示視窗、改變焦點並操作鍵鼠，適合在獨立且可供操作的測試環境執行；測試文件使用臨時資料夾。

無視窗測試中的Alt+Enter只驗證快捷鍵接線。作業系統全螢幕、工作列顯示及真實原生視窗關閉，屬於`native_check.py`的驗證範圍。

## 回歸重點

- 視窗最大化後切全螢幕，保存的是普通視窗範圍，避免下次切回視窗時遺失大小與位置。
- Compile期間背景介面保持inert，自訂Tab／貼上等文字操作遵守busy與readOnly狀態。
- 文字保存失敗保留草稿，閒置重登入先等待自動保存完成。
- 原生視窗直接關閉不出現未儲存提示；介面內的離開動作仍處理草稿。
- 上傳包包含根目錄HTML、assets、native、測試、工具與文件，排除個人資料及本機環境。
