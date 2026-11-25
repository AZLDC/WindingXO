# 驗證方式

獨立HTML版：Node22以上、系統Microsoft Edge，執行`node tests/browser_check.mjs`。透過內建WebSocket及CDP啟動無視窗Edge，臨時獨立profile測完刪除，不安裝Playwright或Node副本。

涵蓋真正file://頁面且沒有Python橋接：首次七項預設、保存／另存與衝突、20步history至少連續12步復原／重做及分支、右鍵Cut／Copy／Paste（剪貼簿替身不碰OS）、標題選單最大化／還原、App存檔主題及指標拖曳、雙尺寸對話框／右鍵邊界、Compile／Active、重開機自動保存具名／未命名避衝突／保存失敗不遺失內容、已開手動存檔對話框不被錯誤覆寫、重登入App關閉、刪空不補預設。框架測Loading→登入→桌面→保存→idle重開機→關機與外層reload，父網址維持index；父子native API注入回傳不同內容以證明呼叫父橋。瀏覽器全螢幕若因headless／背景許可拒絕則驗證錯誤回傳及快捷鍵接線，不冒稱已實測原生視窗。

焦點用Emulation.setFocusEmulationEnabled，不搶使用中的OS視窗焦點。測試結束移除臨時profile；沒有新安裝大型套件。

圓尺檢查：1280×800／390×600擷取實際ring繪製參數，確認十圈、三組、相鄰半徑只隔2px；最後三圈為前景且各露出至少24px。以實際Canvas stroke／fill屬性驗證前景線寬、顏色亮度／透明度、微光及尺面遮擋優於後景。可選WINDING_PREVIEW_DIR輸出少量畫面，預設不產生截圖；只以替身驗證Alt+Enter接線，避免無視窗Fullscreen許可依OS焦點而卡住，不聲稱原生全螢幕實測。

等分標字另攔截Canvas實際fillText，90度必須只畫0／90／180／270，45度八個、30度十二個；35px小內圈仍須四方位標字。檢查實際各組參數為外至內15／30／45／90或30／45／90，不能只改測試用單圈而漏掉畫面接線。

低面數角色檢查：頂點／三角面均介於500與4000／5000，座標有限值、索引有效、四部位皆有面，兩個眼部特徵存在；head切換仍有效。可選預覽輸出正面、斜面、側面與背面（只輸出至指定視覺資料夾，不內嵌來源模型或下載原資產），目視確認造型及背面不出現眼睛。既有保存／編輯／Compile／idle與固定框架完整鏈路也須通過。

開機區塊檢查：框架內Loading在1280×800、1920×1200、1920×1080、800×600、640×480、390×600六組尺寸，虛擬800×600以min(寬/800,高/600)等比置中，外圍body純黑，不拉伸或裁切。標誌、文字、進度條及原36px構圖偏移同比例縮放；WebGL緩衝固定800×600。1920×1200時顯示1600×1200及左右160px黑邊。其後滑鼠累計登入／保存／idle／關機與父網址保持index的鏈路仍通過。

使用專案 `.venv` 中的 Python 3；不要使用可能指到 Python 2 的裸 `python` 指令。

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
.venv\Scripts\python.exe -m compileall -q native tests
node --check assets/js/desktop.js
node --check assets/js/runtime.js
node --check assets/js/angel-visual.js
```

儲存層涵蓋 UTF-8 讀寫、重建儲存物件後保留、同名保護、更新、復原區、無效檔名、檔案大小與列表篩選。符號連結測試在 Windows 未提供建立連結權限時會跳過，路徑跳脫與裝置名稱仍獨立測試。

`test_window_state.py`覆蓋模式／大小／位置保存與重載、損壞設定、DPI換算、普通／最小化／最大化、最大化切入full時的普通範圍備份、多螢幕負座標及螢幕移除。`test_app_lifecycle.py`用假webview確認啟動參數與closing保存接線，不啟動GUI。

原生直接關閉規則：test_app_lifecycle固定斷言confirm_close=False，並驗證同一closing回呼仍寫入視窗幾何；shutdown_check則確認介面內關機的儲存／不儲存／取消提示仍有效。未開原生視窗時不宣稱已實測Windows╳點擊。

介面與原生整合檢查另需 Playwright 套件與已安裝的 Microsoft Edge：

**操作護欄：原生視窗測試會顯示全螢幕並改變輸入焦點，只有使用者明確允許且電腦可供測試時才能執行。不得為了驗證而直接打斷使用者操作；預設只做靜態或無視窗檢查。**

```powershell
.venv\Scripts\python.exe -m pip install -r tests/requirements.txt
.venv\Scripts\python.exe tests/angel_check.py
.venv\Scripts\python.exe tests/editor_check.py
.venv\Scripts\python.exe tests/boot_check.py
.venv\Scripts\python.exe tests/idle_check.py
.venv\Scripts\python.exe tests/compile_check.py
.venv\Scripts\python.exe tests/shutdown_check.py
```

- `angel_check.py`：無視窗Edge接真正Python儲存層，檢查日文XP開始選單只有兩個系統按鈕且沒有文件；Angel常駐Null／文件列表、四選單、UTF8儲存／開啟／刪除、編輯區開關保留草稿、拖曳／縮放／最大化、最小化停止繪圖、登出取消／不儲存與重新登入。Canvas需有超過500個真實3D頂點、十個刻度環、連續幀畫面不同，並測區域切換與資料。擷取兩個時間點的實際ring繪製參數，驗證三個中心、每圈360格、同組旋轉差一致、上方為順時針；磁碟以4GB／32%測精確文字，錯誤時UNAVAILABLE，隨後恢復實際API。
- `ui_check.py`及`toy_check.py`保留舊指令相容性，均轉接angel_check，不需重複執行。
- 重複按鈕檢查：editor_check斷言Angel無EDITOR按鈕、編輯器無最小化且只有兩個標題列控制；angel_check以關閉及Open驗證面板進出，Angel自身最小化／工作列還原仍獨立驗證。
- `editor_check.py`：Ctrl+S首次／原檔儲存、Untitled預填、Ctrl+Shift+S另存／取消／覆寫確認與取消後草稿保留，檢查無功能列及底部資訊列、青藍捲軸、雙向內容溢出、鍵盤捲動與雙尺寸邊界。無視窗瀏覽器停用預設hide-scrollbars參數，確保截圖確實包含捲軸；移動捲動位置前先移動游標，避免游標已在終點造成不捲動的假失敗。截圖在`.scratch/local/editor/`。
- `boot_check.py`：虛擬時鐘驗證不移動／單次或同座標移動不跳頁、點擊／Enter／空白鍵不計時、有效移動滿5秒進登入、短停不計時、恰好3秒保留、超過3秒重算。
- `idle_check.py`：虛擬時鐘測299999／300000ms邊界、輸入重新倒數、登入／桌面／Angel全黑；電源點擊與Alt+Enter／Ctrl+S喚醒不穿透，返回Loading、再次累計5秒再登入、內容自動存回原文件且App關閉。假原生視窗未收到關閉／切模式呼叫。雙尺寸全黑截圖在`.scratch/local/idle/`。
- 閒置延伸情境：idle_check模擬失焦後只推進系統時間、不執行timeout，focus回來必須立即黑屏；再登入不自動開App。保存不足／失敗取消切頁、解除黑屏並提示，Node主鏈路涵蓋未命名自動編號及原對話框保留。test_disk_usage以mock驗證讀App磁碟路徑、回傳容量及OS錯誤包裝，不操作系統電源或視窗。
- angel_check的雙尺寸幾何另查diskUsage與regionControls在App範圍，四個部位按鈕只出現在下方控制區、不在上方資訊面板，控制區與資訊區不重疊。
- 大標題定位：雙尺寸檢查標題左緣在App右半部、右緣留10～30px，diskUsage左緣與大標題左緣差小於1px。
- `compile_check.py`：無視窗與虛擬時鐘檢查獨立終端、8秒漸進填滿、100%短暫停留、未開編輯器始終保持隱藏、原有草稿與可見狀態不變、已存檔不被自動覆寫、完成才可Active、逐檔狀態及CANCEL／Escape取消。兩尺寸編譯介面截圖與邊界證據在 `.scratch/local/compile/`。合成Tab事件也不得修改背景唯讀文字。
- `shutdown_check.py`：以假的原生視窗計數destroy呼叫，不真的關閉App或作業系統；檢查登入右下電源、日文XP關機、未儲存文件的儲存／不儲存／取消，以及系統選單和71檔Angel列表的分離。截圖在`.scratch/local/shutdown/`。
- 雙尺寸1280×800、390×600：檢查Angel精確填滿App，XP工作列與開始選單隱藏，650ms圖示圓形展開及過程截圖；最小化恢復XP選單並可由工作列還原。刻度數字在大尺寸至少20px。另查列表可捲動且無捲軸、子選單四項文字、編輯面板限制於右側、資料區及日文開始選單邊界。截圖保存於`.scratch/local/angel/`。長檔名省略及列表內部分列捲動截斷為預期設計，重要控制不得離屏。
- `native_check.py`：實際開啟 Windows WebView2 視窗，檢查啟動無邊框且填滿螢幕、具工作列顯示條件、外層及框架內 Alt+Enter、框架切頁保留視窗模式，以及真正的 JavaScript／Python 溝通、存入磁碟與 Open。測試結束只關閉自己啟動的程序樹，文件使用臨時資料夾。原生測試會短暫顯示視窗。
- 原生自動化使用隨機本機除錯埠，僅在測試程序開啟；一般啟動不開啟除錯埠。跨頁後以點擊 Angel Player 建立 WebView2 的自動化輸入焦點，避免 CDP 鍵盤事件未送達頁面的假失敗。

## 維護防錯

Compile背景回歸：compile_check另查外層背景透明、沒有背景圖，透明處命中遮罩；以無視窗瀏覽器點擊背景按鈕位置及嘗試移動焦點，確認不能觸發新增文件、背景不能取得焦點，Tab仍進入取消按鈕。完成後workspace解除inert，並繼續驗證文件操作。兩尺寸截圖應顯示原App畫面與中央進度面板。

### P-20261124-001：Windows Python 入口與原生測試就緒條件

tags: Python、Windows、測試可靠性

trigger: 直接使用 `python` 或只以除錯埠開啟判斷視窗就緒。

symptom: 本機 `python` 指到 2.7；原生自動化可能找不到視窗，或跨頁後的鍵盤事件未送達網頁。

scope: 啟動器、原生整合檢查。

root_cause: Python 多版本入口不同，venv 啟動器與實際視窗程序的 PID 可能不同；除錯埠、原生視窗、頁面載入與輸入焦點各自有不同就緒時間。

fix: 用 `py -3` 建立環境後固定使用 `.venv`；測試由實際 host 回報 PID，等待可見視窗、頁面與 API 就緒，跨頁後點擊取得自動化輸入焦點。

prevention: 重跑 `tests/native_check.py`，不得以瀏覽器替身結果取代原生整合結果；保留 `.scratch/local/native/` 證據。

verification: 原生視窗、三頁快捷鍵、磁碟保存與預覽的自動化斷言。

links: [原生整合檢查](../tests/native_check.py)、[啟動器](../啟動.cmd)

status: resolved

### P-20261124-003：全螢幕記憶必須保存普通範圍

tags: Python、WinForms、狀態一致性

trigger: 普通視窗先最大化，再切全螢幕並關閉。

symptom: pywebview的old_size可能是最大化範圍，重開後切回視窗會遺失原本普通大小與位置。

scope: WindowState擷取與DesktopAPI.toggle_fullscreen。

root_cause: 函式庫記錄的是切換前Size／Location，不一定是RestoreBounds，public fullscreen也不代表當前實際模式。

fix: 進入full前保存普通RestoreBounds，關閉full時優先採備份；透過native.is_fullscreen辨識模式。

prevention: 固定保留「最大化→full→關閉」及DPI換算的無GUI測試，升級pywebview時重新閱讀原生實作。

verification: 純資料與假原生物件測試通過，獨立只讀複核確認；未宣稱已通過真實原生視窗驗證。

links: [視窗狀態](../native/window_state.py)、[狀態測試](../tests/test_window_state.py)

status: resolved

### P-20261124-002：自訂輸入必須遵守唯讀狀態

tags: JavaScript、編輯器、狀態一致性

trigger: 編輯器在儲存或 Compile 期間設為 readonly，但仍執行自訂 Tab 插入。

symptom: setRangeText 可繞過原生 readonly，使畫面內容與完成狀態指向的文字不一致。

scope: desktop.js 的文字區 keydown 處理。

root_cause: readonly 只限制原生輸入，不會阻擋程式直接修改 value。

fix: 自訂文字輸入處理在 busy 或 readOnly 時直接返回。

prevention: 自訂插入、貼上或格式功能均先檢查編輯狀態；compile_check 必須覆蓋 Compile 期間的合成 Tab 事件。

verification: 先以無視窗 DOM 測試重現舊邏輯會插入 Tab，再修正並重跑完整玩具流程。

links: [玩具流程檢查](../tests/toy_check.py)

status: resolved
