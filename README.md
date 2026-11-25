# Macrosoft Winding XO

可由瀏覽器獨立運作，也可由Python承載的同人玩具：XP風格桌面、日文開始功能表，以及黑與亮藍線框風格的Angel Player。文件內容只作文字處理，不執行Script。

## 獨立HTML版

直接用Edge／Chrome開啟根目錄 [index.html](index.html)，保留五個HTML入口與整個`assets/`資料夾即可，不需要Python、`.venv`或伺服器。GitHub Pages沿用`master / (root)`，完整專案透過Git同步至`AZLDC/WindingXO`的`master`分支；SSH沿用本機帳號設定，專案不保存驗證資料。[Git同步與部署說明](docs/deployment.md)。

`index.html`是固定的滿版框架入口，預設載入`Loading.html`。開機、登入、桌面、模擬重開機與關機只切換框架內容，網址列保持入口網址；重新整理整頁會重新進入Loading，不回到上一個App畫面。

- 儲存及另存新檔使用瀏覽器內建IndexedDB資料庫，保存虛擬文件的名稱與內容，不建立實體文字檔，也不在HTML旁建立資料夾。重新登入／重新開啟同一位置可繼續使用；換瀏覽器或使用者設定檔不共用，清除瀏覽器資料也會清除文件。Python版的texts不受影響，兩版資料不自動同步。
- 第一次建立瀏覽器資料庫時，預載Hand Sonic、Distortion、Delay、Harmonics、Absorb、Howling、Overdrive七份可編輯範例。之後全部刪除會顯示`(null)`，不自動補回；再次開啟也不覆寫修改內容。能力名稱與簡述參考[Angel Beats Wiki](https://angelbeats.fandom.com/wiki/Kanade_Tachibana)，內容是同人筆記，並非原作程式碼。
- 保留Ctrl+S、Ctrl+Shift+S及Open／Delete／Compile／Active。Compile與Active仍只演出，虛擬文件單份上限2MiB，同名需確認覆寫；Delete原子移至資料庫的trash區。
- 容量欄與Python版統一為`… GB · …% USED`。網頁版使用瀏覽器Storage API提供的本站儲存配額／使用量估計，並非整顆硬碟；無法取得時顯示`— GB · —% USED`，不虛構數值。Python版仍讀取App所在磁碟區。
- 點擊頁面後可用Alt+Enter切換外層瀏覽器全螢幕；內容在框架內切頁，Esc或重新整理外層仍可能離開全螢幕。瀏覽器需要使用者互動及許可，無法保證載入即全螢幕。[Fullscreen API說明](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)
- 網頁版關機與登入電源顯示黑底灰白日文「コンピューターの電源を切ることができます。」（可以安心關機）。優先使用系統MS Gothic／MS UI Gothic舊字型，以12px粗體格點繪製、去除抗鋸齒並最多3倍整數放大（空間不足降為2倍或1倍），呈現早期點陣感；載入時先保持全黑，等系統字型、點陣繪製及放大尺寸就緒才顯示，避免小字閃現。不下載字型，無Canvas時以同色系文字顯示。未操作滿5分鐘進入既有全黑假關機狀態；鍵鼠喚醒後回Loading，再跑滑鼠累計5秒與登入流程，框架入口網址不變，文件保留。分頁也可由使用者直接關閉。普通網頁不能保證自行關閉使用者開啟的分頁。[瀏覽器關閉限制](https://developer.mozilla.org/en-US/docs/Web/API/Window/close)

## Python版啟動

Windows 10/11、Python 3.10 以上與 Microsoft Edge WebView2 Runtime。雙擊 `RUN.cmd`，首次會在 `.venv` 安裝相依套件，之後直接啟動。也可手動執行：

```powershell
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r native/requirements.txt
.venv\Scripts\python.exe native/main.py
```

首次預設無邊框全螢幕，之後恢復上次關閉的全螢幕／一般視窗、大小、位置與最大化狀態。`Alt+Enter` 切換全螢幕／視窗，`Alt+F4` 關閉 App。設定儲存在 `data/window-state.json`；損壞時回預設，螢幕變更時校正回可見範圍。切頁不改變原生視窗模式與螢幕解析度，系統工作列保留程式項目。

原生視窗右上角 `╳` 與 `Alt+F4` 直接關閉App，不顯示未儲存確認，也不自動儲存草稿；關閉時仍保存視窗模式與位置。介面內的NEW／Open／登出／關機等草稿確認保留。

## 開機與登入

- Loading模擬800×600的4:3開機畫面，整組等比例縮放到視窗可容納的最大尺寸並置中，剩餘空間填黑，不拉寬、不裁切。1920×1200顯示為1600×1200，左右各160px黑邊；小視窗也整組縮小。WebGL開機圖案固定以800×600繪製，既有640×480構圖先等比放大1.25倍，文字與進度條一起適配。
- 開機進度條靠近Winding文字下方，與標誌排版區保留約24px間距，不再放在開機區塊最底端。
- 標誌、文字與進度條在原構圖中整組向下偏移36px，間距與偏移隨畫面同比例放大；虛擬顯示區本身置中。
- 開機畫面等待滑鼠移動，累計有效移動滿5秒才進登入。停頓不超過3秒保留累計，停頓本身不計時；超過3秒再移動時從零重算。沒有移動、單次移動後停住、點擊或鍵盤都不會跳過，不再使用隨機秒數。
- 登入畫面、桌面與Angel Player在App內沒有鍵鼠操作滿5分鐘後全黑，遮住並鎖住底下介面；滑鼠移動／點擊、滾輪或鍵盤喚醒後回到開機畫面，再累計滑鼠移動及登入。喚醒輸入只用來喚醒，不同時觸發底下功能。只偵測App內輸入，不監控其他程式，也不改原生視窗模式。
- App失去焦點的時間也計入閒置，其他程式上的操作不會重設此App倒數；返回App時補查是否已滿5分鐘，避免背景計時器延遲而跳過黑屏。
- 模擬重開機先等待未儲存文字自動保存：具名文件存回原名稱，未命名用`Untitled.txt`／`Untitled (1).txt`等未佔用名稱，不覆蓋其他文件。成功後回Loading及登入，桌面不自動開啟Angel Player或編輯器，Compile／Active狀態重新開始。保存失敗則留在原畫面並顯示錯誤，避免遺失內容。
- 密碼明碼設在 [assets/js/config.js](assets/js/config.js)，比對大小寫，錯誤顯示 ACCESS DENIED；僅為玩具演出。
- 登入右下角電源圖示只關閉此 App。

## XP 桌面與開始功能表

- 桌面、工作列與日文 `スタート` 選單維持 XP 樣式。
- **開始功能表的實際功能只有 `ログオフ` 與 `終了オプション`**。前者返回登入頁，後者關閉 App；其他 XP 項目只作外觀，不提供操作。文件列表與編輯功能集中在Angel Player。
- 登出／關閉前若有未儲存草稿，可儲存、不儲存或取消；登出不關閉原生視窗，視窗模式保持。檔案保存於磁碟，不因登出刪除。
- Angel Player 的識別保持四芒星 `✧`，桌面與工作列一致。

## Angel Player

- 點桌面 `✧ Angel Player`，畫面由圖示位置向外展開650ms並填滿整個App，不留外框或桌面邊緣，XP工作列與開始功能表隱藏。最小化／關閉Angel回到XP桌面，工作列恢復；不改變原生視窗模式，`Alt+Enter`與視窗記憶沿用。
- 左側文件列表常駐，沒有檔案顯示 `(null)`；列表可捲動且不顯示捲軸。子選單預設隱藏，滑鼠移到文件主項目才展開；停在主項目或右側子選單時保留，離開兩者（包括列表空白、主畫面或App外）立即隱藏。載入或重建列表不因滑鼠原本停在該處而自行展開。
- 右側為深黑背景、亮藍線條、三組共十個正圓刻度環、持續繞Y軸旋轉的三維網格人形，以及局部與文件資料區。左側四環與右下三環各自整組逆時針轉動，上方三環獨立順時針轉動；同組同心環同速同向，不交錯反轉。每圈360格，主／中／小刻線分級。HEAD／TORSO／ARMS／LEGS切換部位線框與說明；畫面由Canvas幾何繪製，不依賴Flash。最小化或關閉Angel後停止繪製。
- Angel標題下顯示App所在磁碟區總容量（十進位GB）及已用百分比，來自Python讀取實際磁碟資料，開啟及顯示期間每分鐘刷新；無法讀取顯示 `DISK UNAVAILABLE`，不填入虛構容量。
- 畫面內 `ANGEL PLAYER` 大標題置於右半部，末尾R靠右保留留白；下方容量／使用率對齊標題A的左緣，整組隨視窗寬度定位。標題、說明及容量區背景透明，不加深色底板或背景漸層。
- HEAD／TORSO／ARMS／LEGS四個部位按鈕位於右下獨立控制區，上方資訊面板保留部位／文件說明；選擇仍高亮主畫面的對應線框。目前尚未提供局部放大展示。
- 中央人形以[さとむ／Anime girl body low poly](https://sketchfab.com/3d-models/anime-girl-body-low-poly-b2b267461d504a5b95976f367423d0b3)現成GLB為基礎，來源654頂點（含接縫重複點）、1,022三角面。來源是素體，沒有長髮、制服或獨立眼睛；並非立華奏角色模型。手臂保持來源T字姿勢，不加骨架或放下手臂。
- 後腦原本的大平板補成左右對稱的水平橢圓弧；頭頂高度及前半臉原控制點保留。焊接接縫後進行兩次實際曲面細分，輸出8,188頂點／16,352三角面，降低手臂等部位的大折面；身體原控制點每輪最多移動0.018模型單位（身高約6.8），兩輪總位移不超過0.036，維持已確認的身形比例。
- 曲面網格放在`assets/models/avatar-mesh.js`（約750KB），作者、原始授權標示、來源、GLB SHA-256及修改說明保留在`assets/models/avatar-license.json`。來源標示Sketchfab Standard，頁面為Free Standard，不是CC0。Canvas保留旋轉、隱藏背面與四部位高亮；T字姿勢寬度隨畫布容納，無套件、貼圖或網路依賴。重新轉換：`node tools/convert-avatar.mjs <來源.glb>`；只接受此類無骨架／動畫、矩陣變換的靜態三角網格，曲面修整由`tools/avatar-surface.mjs`執行，原GLB不變。
- 人體分析線框另依三角邊長分成最多12等分的細格線，採青藍色、部位高亮及緩慢掃描亮帶；這層顯示線不回寫模型，也不影響文件或Compile。幾何驗證：`node tests/avatar_surface_check.mjs`，檢查後腦弧度、左右對稱、前臉／身體控制點保護與網格連接。
- 刻度環使用寬刻度帶，刻線與數字隨半徑放大（數字12～23px），小環減少數字密度。
- 每圈內外兩側都有刻度，數字位於兩排之間；同組各圈依刻度帶邊界緊鄰排列，只留2px。左上圓尺在前景，會遮住後方穿越的線條，刻線較粗、較亮並帶微光；左側及右下為較暗的後景層。
- 每組由內往外依序標示90°、45°、30°，左側四圈的最外圈再用15°。最內圈只顯示0／90／180／270，較小時仍保留這四個數字；各圈細刻度仍為每度一格。
- `＋ NEW` 建立空白文件，檔案子選單 `Open` 開啟文件及編輯區。Angel上方不提供重複的 `EDITOR` 按鈕；編輯區只保留最大化／還原與關閉按鈕，不提供最小化。編輯區可在右側範圍拖曳、調整大小，不遮掉左側列表。關閉編輯區只隱藏，草稿保留並在NEW／Open／離開前處理；Angel本身仍可最小化回桌面。
- 編輯器不顯示上方功能列與底部檔名／狀態列，未命名標題顯示 `Untitled`。`Ctrl+S` 保存文件，首次輸入檔名（預設 `Untitled.txt`）；`Ctrl+Shift+S` 另存新檔，成功後編輯新檔、保留原檔，取消保留草稿。同名另存須確認覆寫。接受 `.txt`、`.js`、`.py`、`.md`，UTF-8，單檔上限2 MiB。
- `Ctrl+Z`復原、`Ctrl+Shift+Z`重做，保留20步內容及選取範圍；復原後新輸入會清除重做分支。NEW／Open重設歷史，儲存／另存不清除歷史。
- Angel內的存檔／確認視窗採黑藍水晶風格，拖曳標題可移動且限制在畫面內；每次重新開啟居中。XP桌面觸發的對話框沿用XP風格。
- 全域抑制瀏覽器原生右鍵。XP桌面／工作列提供模擬系統選單；Angel只在主視窗標題列、編輯器標題列與文字區提供對應自訂選單，其餘位置不顯示。文字選單支援Undo／Redo、剪下／複製／貼上、刪除、全選、儲存／另存，剪貼簿需瀏覽器允許。完整[功能與模擬範圍](docs/context-menu.md)。
- 編輯器水平／垂直捲軸只有三角箭頭與滑條，軌道透明，使用與邊框一致的青藍色；保留原生點擊、拖曳及鍵盤捲動。
- 文件位於 `texts/`，跨重啟保留。列表與編輯器標題隱藏結尾 `.txt`（不分大小寫），實際檔名不變。
- 檔案右側子選單**只有 `Open / Delete / Compile / Active` 四項**；啟用後最後一項為 `Deactive`。Open載入編輯區；Delete確認後移至 `texts/.trash/`，可人工復原。
- Compile讀取選定的已存檔，以登入同風格的獨立終端顯示約8秒進度，100%停留350ms後回Angel；CANCEL／Esc可取消。不開啟、切換或自動保存編輯器，原草稿不變，編輯區沒有Compile按鈕。
- Compile進度面板直接疊在App畫面上，外層透明，不能以整片黑底取代App背景。透明遮罩仍攔截點擊，背景介面鎖定且不能取得鍵盤焦點，直到完成或取消關閉面板才恢復。
- 完成Compile後才可Active／Deactive，皆不執行內容；列表圖示即時反映啟用。修改內容、異內容覆寫或刪除會重設狀態，相同內容存檔保留。狀態只存在目前桌面工作階段，登出或重啟重設。
- 靜態介面文字不可反白；文字編輯區及密碼／檔名輸入保留文字選取與複製。

## 目錄

```text
index.html          固定網址的滿版框架入口
Loading.html        800×600虛擬開機畫面
login.html          登入畫面
desktop.html        XP桌面與Angel Player
shutdown.html       日文安全關機畫面
assets/css/         共用、XP及Angel樣式
assets/js/          框架、儲存、編輯與動畫程式
assets/models/      轉換後模型與來源授權
native/             Python桌面入口、儲存與視窗狀態
tests/              無視窗檢查與資料測試
tools/              模型轉換、曲面修整及上傳封裝
docs/               設計、驗證與GitHub部署說明
RUN.cmd             Python版Windows啟動入口
AGENTS.md           AI協作指引
.nojekyll           GitHub Pages直接提供靜態檔案
texts/、data/       執行時建立的個人資料（不進git／上傳包）
.venv/              本機Python環境（不進git／上傳包）
.scratch/local/     本機產物及封裝包（不進git／上傳包）
```

## 開發與測試

測試環境為Python 3.10以上、Node.js 22以上及Microsoft Edge。主要檢查：

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
node tests/avatar_surface_check.mjs
node tests/browser_check.mjs
```

模擬GitHub Pages子路徑：

```powershell
$env:WINDING_HTTP = "1"
node tests/browser_check.mjs
```

測試涵蓋檔案保存、視窗狀態、框架導頁、編輯器、Compile、閒置重登入、模型幾何及版面。[完整測試說明](docs/verification.md)、[介面設計](docs/desktop-design.md)。

## 部署與封裝

GitHub Pages使用`master / (root)`，提交並推送後自動部署。需要分享完整原始碼時可執行：

```powershell
.venv\Scripts\python.exe tools/package_project.py
```

封裝包位於`.scratch/local/releases/WindingXO-project.zip`，包含原始碼、測試與文件，排除虛擬環境、個人文件及快取。詳細設定見[部署說明](docs/deployment.md)。
