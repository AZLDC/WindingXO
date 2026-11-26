# XP 系統層與 Angel Player 工作區

## 固定框架入口

index.html只承載100%大小的appFrame，初始src為Loading.html（原開機頁）。內容內的location導頁仍在同一iframe，不改外層網址；外層重新整理會重建Loading。activity重新開機指向Loading而非index，避免框架套框架。

外層持有唯一的瀏覽器儲存或原生pywebview API。file://框架之間不假定可直接存取彼此DOM：runtime用postMessage回外層，shell只接受appFrame.contentWindow且方法在白名單內的請求；客戶端只接受父層回覆，UUID匹配請求並有逾時。原生API未就緒時等pywebviewready，避免子頁另建資料庫。瀏覽器關機事件只改appFrame.src，原生關機仍關閉自己的視窗。

## 瀏覽器儲存分支

外層先載入browser-api.js再載入runtime.js。原生UA或頁面已有pywebview.api時不建立瀏覽器API；外層getWindingAPI優先原生API，否則使用瀏覽器API，框架內getWindingAPI只提供父層RPC代理。native延遲注入時由shell等pywebviewready，不會在內容頁誤種瀏覽器預設。直接開啟單一內容頁的測試仍可使用同一儲存分支。

HTML版用IndexedDB windingxo-browser v1，files以name為key、保存content，trash以UUID保存刪除內容。唯第一次資料庫建立的upgrade交易種入七份Guard Skills；刪空不觸發重種，沒有匯入／匯出實體檔要求。名稱及副檔名只是虛擬識別，沿用2MiB與衝突確認。保存的檢查與寫入同一readwrite交易，完成才回成功；刪除與trash寫入亦同一交易，避免部分成功。

HTML的get_disk_usage回kind:browser及Storage API儲存配額／用量估計，前端沿用GB／USED格式，不假裝可見整個硬碟。toggle_fullscreen使用Fullscreen API，close_app前往shutdown.html，顯示灰白日文安全關機文字並沿用5分鐘閒置黑屏／喚醒回Loading。shutdown-text.js使用系統MS Gothic等字型以粗體繪入12px格點、二值化字緣並依可用寬度以3／2／1整數倍放大，降低現代字緣平滑感；窄畫面可換行，不打包或下載字型。關機main預設visibility:hidden，等待document.fonts.ready並完成像素繪製／CSS整數放大後才以pixel-ready一次揭露，避免原始h1先閃出小字；無Canvas或停用JS時保留文字替代顯示。Python分支仍操作原生視窗與texts，不共用瀏覽器資料。

獨立file://流程以Windows系統Edge驗證；同一設定檔及同一檔案位置使用，不保證不同瀏覽器對本機檔案的儲存隔離方式一致。改檔案位置或清瀏覽器資料前需自行保留需要的內容。

Python以固定pywebview6.2.1承載本機HTML，首次全螢幕，之後恢復上次模式／幾何。原生設定與檔案API沿用既有實作，不因Angel介面重做儲存層。

原生視窗使用confirm_close=False，右上角╳及Alt+F4直接退出，沒有通用未儲存提示，也不保存未存草稿。closing仍同步記憶視窗幾何。頁面內文件切換、Angel關閉、登出與關機的canLeave確認維持。

## 開機與閒置循環

Loading的stage為800×600虛擬4:3區塊，縮放係數min(innerWidth/800,innerHeight/600)，以left/top 50%及translate(-50%,-50%) scale(...)置中，周圍body純黑。既有640×480構圖以1.25倍放入stage，字體依bootContent邏輯寬度計算，避免再次套用螢幕縮放。WebGL固定800×600繪圖緩衝；大小視窗均整組等比例適配，不拉伸、不裁切。1920×1200時實際區塊1600×1200，左右各160px黑邊。

各入口共用activity.js。開機以mousemove座標變更為採樣，事件間隔小於250ms才累計；250ms未移動、失焦或頁面隱藏清零，失焦期間不累計。連續2000ms送winding:boot-finishing；Loading將進度條停在隨機可見位置1000ms，再移動1000ms才送winding:boot-ready並進login。達標後不需繼續操作。單一事件、同座標、鍵盤與點擊均不累計。

login及desktop維護最後輸入的5分鐘deadline，鍵盤、移動／點擊／滾輪重設；黑屏用全App固定最高層遮罩與背景inert、隱藏游標，停止Angel動畫。window capture攔截並消耗喚醒輸入，先送winding:restart，再replace至Loading，避免鍵盤快捷鍵／電源點擊穿透。下次輸入也檢查deadline，涵蓋背景timer節流。開機頁不另啟動5分鐘黑屏。

失焦不重設lastInput；其他程式的輸入不算此App活動。window focus及visibilitychange另外補查deadline，確保背景timeout延遲時，回到App即呈現黑屏並等待喚醒。

restart事件提供waitUntil，activity等待所有保存Promise完成才切Loading。desktop直接保存dirty內容，具名overwrite原檔；未命名從Untitled.txt開始，conflict才試下一編號，避免競態覆蓋。保存失敗恢復原畫面並顯示錯誤，若已存在手動存檔等對話框只追加錯誤，不取代舊handler／Promise。成功後allowNavigation，重新登入桌面不自動還原App或草稿；不再使用sessionStorage恢復工作階段。

## 系統與文件邊界

開始選單的xp-menu-item、xp-all-programs與xp-places內各項目共用滑鼠移入藍底白字回饋，次要文字與箭頭一併反白；離開即恢復。外觀不依是否已有功能區分，尚未實作項目保留無動作，後續可逐項補上事件而不改既有反白規則。電源區沿用原有滑鼠移入效果。

XP桌面及日文開始選單屬於系統層。開始選單提供Echochrome、登出返回login及關App，其餘日文XP項目為靜態裝飾，沒有檔案列表或檔案子選單。登入右下電源同樣只關此App。登出經canLeave處理草稿，核准後以allowNavigation避免第二次beforeunload提示；原生視窗模式保持。

Echochrome由echochrome.js與echochrome.css獨立管理，使用fixed視窗且限制於工作列上方，標題列支援pointer capture拖曳及雙擊最大化／還原。最小化保留iframe與首頁搜尋詞，工作列可還原；關閉將iframe改為about:blank並清空網址記錄，重新開啟回白底搜尋首頁並清空搜尋詞。Angel前景時以visibility與inert隔離後方瀏覽器，不改動Angel編輯器幾何。

搜尋首頁是iframe同層的echoHome，顯示時隱藏iframe並卸載外站，以about:blank作導覽記錄中的首頁，網址列顯示空白。標誌為GuguRu，以逐字span呈現藍／紅／黃／藍／綠／紅，h1提供完整無障礙名稱；使用Century Gothic／Futura／Trebuchet MS／Arial系統字型回退，字級42～64px，不下載專用字型。原生GET表單將q參數送往https://www.google.com/search，target=_blank搭配rel=noopener noreferrer，直接由使用者提交開新分頁；不使用需cx的Google官方嵌入元件或API。搜尋不新增iframe導覽記錄，從網址列導頁後可上一頁返回首頁。

網頁以sandbox="allow-scripts allow-forms"的iframe載入，不授予同源、頂層導頁、彈出視窗或原生API存取。僅接受不含帳密的HTTP(S)網址，其他協定在網址欄顯示日文驗證訊息。前後頁只追蹤網址列提交，不能讀取跨來源內容、連結或重新導向；iframe的load事件只用作載入觀測，不判定網站顯示成功。Google等網站可用X-Frame-Options／CSP拒絕嵌入，不提供代理；首頁表單的新分頁搜尋不受iframe嵌入限制。跨來源輸入無法回傳既有閒置計時，首頁表單則沿用桌面輸入事件。

Angel Player點開後覆蓋整個App內容範圍（fixed inset:0），沒有外框、桌面留邊或XP工作列／開始功能表。以點擊來源圖示的中心作650ms圓形展開，半徑足以覆蓋最遠角落；最小化／關閉取消未完成動畫並恢復XP工作列，工作列保留四芒星✧識別供還原。此顯示模式不切換原生全螢幕，Alt+Enter及視窗記憶沿用。左側文件列表常駐，空時(null)，純文字檔隱藏.txt但用完整檔名識別。平常移入子選單為Open／Delete／Compile／Active或Deactive，僅文件列右鍵額外顯示Rename；改名拒絕重名覆寫，保留草稿及能力資料。選單向右延伸且限制在畫面內，捲動不顯示捲軸。

文件索引以JSON保存name、size、compiled、cost、region。Python版存於texts/.catalog.json，僅首次缺少索引時掃入已有文件，之後列表不掃目錄；瀏覽器版以IndexedDB catalog區的catalog.json記錄JSON字串，升級時從已有files匯入，文件及索引在同一交易更新。前端只在首次開啟或資料操作後讀取索引，收合／重開Angel重用快取。外部直接新增的檔案不自動匯入。

索引讀取先驗證每筆名稱、大小、編譯、消耗、部位及容量，無效資料在變動文件前拒絕。Python以.catalog.lock的跨程序鎖保護索引讀改寫，索引提交失敗時回復已變動的文件。Windows大小寫不同但指向相同文件的保存沿用既有索引名稱；內容比較沿用UTF-8 BOM與通用換行讀取規則。改稿透過可重試佇列清除持久狀態，開始編譯也直接清除持久狀態，避免多分頁使用過期快取。

每部位獨立100%容量。首次成功Compile產生30～40%的固定整數消耗，編譯失效及重編譯保留消耗。Active掛到所選部位，同一能力一次掛一處，總量超過100%拒絕操作，Deactive解除。編譯、掛載及消耗跨登出與重啟保留；改稿、異內容覆寫、開始重新編譯會清除編譯與掛載，取消編譯不恢復。Compile及Active仍不執行文件內容。

右側可開關的編輯面板是Angel的一部分。NEW先確認草稿再建立空白文件；Open先確認草稿才切檔。隱藏面板保留草稿，關閉Angel會先確認再還原至已儲存內容。面板可拖曳／縮放／最大化，但範圍只限右側visualStage，不能遮掉列表。存檔後立即刷新列表，啟用圖示也在狀態變更時同步，不依賴重新開啟功能表。

NEW／Open負責顯示編輯面板，不另設Angel的EDITOR切換按鈕。編輯器標題列僅最大化／還原與關閉，移除與關閉行為重複的編輯器最小化按鈕；Angel自身的最小化回桌面維持。

編輯面板只保留標題與文字區，移除功能列和底部狀態／檔名列。未命名顯示Untitled，Ctrl+S儲存，Ctrl+Shift+S另存；另存以目前檔名預填、同名必須確認覆寫，成功後更新目前檔名與保存基準，取消不改草稿／原檔。捲軸使用WebView2原生操作與CSS樣式，只畫#4bb4cf三角與滑條、透明軌道，避免新增自製捲動狀態。

WindingHistory保留最多20個可復原步驟及游標選取；beforeinput更新修改前的選取，input與自訂Tab／剪貼簿操作記錄內容。Ctrl+Z及Ctrl+Shift+Z自行處理，不依賴textarea原生history。Open／NEW重設，儲存不重設，undo後編輯截斷redo。readonly／busy或其他對話框開啟時不操作文字歷史。

desktop-context.js依所在區域建立一個自訂右鍵選單；文字剪貼簿使用受許可的瀏覽器API，cut須先複製成功才刪字，paste失敗不改內容。App的modal套用angel-modal主題，dialogTitle透過pointer capture拖曳、限制視窗範圍，resize再校正；新ask重設居中。功能分析見context-menu.md。

## 視覺與動畫

外層保留XP，Angel使用近黑藍底、青藍細線、半透明水晶面板、斷角、定位框、刻度、座標與細小標記。字體為Arial與Consolas，強光集中於標題、選定部位與邊線。

angel-visual.js以Canvas2D繪製三組共十個正圓刻度環：左4環及右下3環各自同速逆時針，上方3環同速順時針，組內不交錯轉向。每圈360分度，每5度中刻線、15度主刻線／數字，小環數字降為30度間隔。人形由頭、頸、軀幹、肩肘腕、骨盆、腿膝腳的多環表面與三角／縱向連線構成，實際作Y軸旋轉及透視投影。不是貼圖、影片或單一剪影。區域按鈕選擇HEAD／TORSO／ARMS／LEGS以高亮對應網格；資料面板平常顯示所選部位的能力清單、每項消耗、掛載數及總用量。移入檔案及其子選單時暫顯檔名、編譯／掛載狀態與資源消耗，離開後恢復部位資訊。長名稱換行，清單過長時在面板內捲動。

標題下diskUsage由DesktopAPI.get_disk_usage透過shutil.disk_usage(ROOT)取得App所在磁碟區total／used／free；前端顯示total/1e9 GB及used/total百分比。開Angel即刷新，顯示且未黑屏時每60秒刷新；異常顯示DISK UNAVAILABLE，不用範例4GB代替。

visual-heading整組以右側定位：一般26px、中尺寸18px、窄尺寸12px留白，左側auto。大標題位於右半畫面，副標及磁碟行保留左對齊，對齊首字A，不將容量行另改右對齊。

上方圓尺的負向圓心依最內環半徑限制，避免窄畫面只看得到外環、內圈完全離屏；雙尺寸測三環都至少有20px範圍可見。

rulerMetrics同時定義每圈內／外界、內外刻線及數字空間；rulerRadii以「上一圈內半徑−2px」產生下一圈，不再使用獨立比例造成寬大空隙。內外兩排刻度朝中間延伸，數字居中。左上前景最後繪製，以深色環形尺面遮住後景線條，刻線1.8倍粗、較亮青藍與2.5px微光；後景維持較暗線框。

ring的labelEvery獨立指定數字／主刻線等分，與360個細刻度分開。左側由外至內15／30／45／90度，右下及左上由外至內30／45／90度。最內圈90度即使半徑<60px也保留四個方位標字，必要時只向圓心擴充尺面數字空間，不擴大外緣或相鄰圈間距。

四個部位按鈕位於右下regionControls獨立控制區，不在上方angel-details內。桌面尺寸資料在上、按鈕在下；窄尺寸資料bottom84px、控制區bottom36px，保留間距及最底讀數。按鈕沿用既有區域選擇／線框高亮，不新增局部放大預覽。

中央人形以さとむ「Anime girl body low poly」GLB為基礎，來源與修改說明見assets/models/avatar-license.json。來源654頂點／1022面，曲面網格8188頂點／16352面；來源網格不變。avatar-pose.js保留固定基準的肩臂角度與截面，只對肩頭外上方46個頂點做限幅修順；每點位移最多0.02模型單位，其他8142個頂點保持相同座標。tests/fixtures/avatar-inner-shoulder.json記錄基準來源SHA-256、156個內側座標、允許調整的46個頂點及其他頂點的雜湊；驗證外側以外的姿勢完全不變，不以全肩平均平滑或重新推算的姿勢取代基準。

來源後腦缺少中間支撐點，面直接連接頭頂與頸部，形成平板及水平凹陷；修整只對y>2.58、z<−0.28的後半頭型往外補左右對稱的橢圓弧，與頭頂／頸部漸接。前半臉原控制點與頭頂高度鎖住，身體原控制點每輪最多平滑0.018單位，新邊點相對中點最多0.025，避免全局平滑明顯改變身形比例。曲面每次由原GLB重建，不重複疊加加工。浮點輸出到小數6位以控制資產大小，約750KB，無新執行期套件。

head／torso／arms／legs為依來源網格位置附加的展示標籤，並非可動畫骨架，收臂後不重新分配標籤。人形以2π/10rad/s繞Y軸旋轉，每10秒一圈。drawHuman沿用投影面方向剔除背面、平均深度排序、暗紅實心遮擋及桃紅線框；選中部位提高同色亮度。humanLayout依收臂後旋轉半徑與畫布寬度限制比例；手機以資訊面板頂端計算可用高度，讓全身及追蹤框留在面板上方。人形背後保留柔邊暗色漸層，動畫仍只有一條RAF，不新增Three.js／線上播放器。

資訊面板machine-code區沿用青藍Consolas字體，4行各3組四位Hex。AngelVisual.updateHex沿用draw的時鐘，每秒最多替換一組，region變更時整組重建；不另設計時器，隱藏或編譯暫停繪圖時一起停止。CODE / SIMULATED標示虛構性質，不執行字串或取代既有掛載資訊。

wireDivisions依來源三角形最長邊長除以0.18模型單位，向上取整並限制1～12。drawHuman在原三角面內增加三方向格線，使用相機距離9的透視校正插值，不移動原始頂點或改變外輪廓；依部位選取決定亮度，緩慢掃描亮帶用線條漸層完成，不另設計時器或遮罩攔截輸入。

Canvas依容器尺寸及最多2倍DPR設置，半徑在同一座標比例下計算，保持正圓。刻度數字隨半徑縮放並限制12～23px；主要刻線約半徑7%，小環限制最大長度並降低標字頻率，內外緣留出完整刻度帶。畫面最多約30fps；Angel隱藏、頁面不可見或Compile覆蓋期間停止繪製，恢復時只啟動一條RAF鏈。窄尺寸列表仍常駐，資料面板移到底部，編輯面板限制於右側。

## 沿用規則

Compile只讀所選已存檔，以獨立登入風格終端顯示基本8秒進度及350ms滿格停留；80～99%抽取1～3個不同百分比，每處暫停300～1000ms，暫停時間不計入有效進度。不Open、不切換或自動保存草稿。背景inert，包含停頓期間均可CANCEL或Escape取消，finally清除計時器、恢復背景及Angel動畫。完成才可Active；狀態由文件索引保存，詳見README的Compile與掛載說明，不執行任何Script。

Compile外層透明，直接呈現底下App，不另畫全畫面黑底或掃描線；中央終端面板保留原風格。全畫面遮罩保留命中範圍與pointer events，workspace設inert，鍵盤Tab限制在取消按鈕，關閉前不能穿透操作底層。

TextStore只接受單層文字檔名與指定副檔名，拒絕跳脫／裝置名／符號連結，UTF-8原子寫入。Delete確認後移至.trash。

三頁共用interaction.css限制靜態UI文字選取，僅輸入欄位及文字區覆寫為text。

視窗狀態在原生closing同步保存至data/window-state.json，使用native.is_fullscreen辨識實際模式，full前備份普通RestoreBounds以免最大化幾何覆蓋。實體像素依_scale換算，啟動校正螢幕範圍；此處依賴固定WinForms結構，升級需複核。


## 網站游標

Loading與固定框架先使用assets/cursors/black-dot.png；進入登入或桌面後，html的crystal-cursor類別以靜態水晶圖作fallback。crystal-frames.js提供96個32×32 PNG資料URL，cursor.js以performance.now及受控計時器每6秒循環，透過--crystal-cursor更新CSS cursor，hotspot固定3,2。這是原生CSS游標，不新增跟隨指標的DOM覆蓋層，框架內切頁也使用相同資產。

interaction.css接管一般區域、操作按鈕與文字輸入框；input／textarea同樣使用水晶滑鼠游標，原生文字插入線保留，resize-handle及對話框標題沿用縮放／移動游標，禁用控制為not-allowed。背景頁、pagehide及winding:idle停止動畫，visibilitychange、pageshow或winding:resume恢復；黑屏沿用黑點游標。模擬關機頁不載入水晶動畫或加上crystal-cursor類別，僅保留黑點游標；cursor.js也以該類別作為啟動條件。

幾何來源tools/crystal-cursor-source.js保留中空及V字凹口，以薄晶面沿長軸旋轉。tools/build-cursors.mjs用無視窗Edge離線產生PNG及幀資料，網站執行時直接讀取專案資產，不下載外部圖片。


## XP開機進度條

進度條位於原640×480構圖的寬20%、高3%（128×14.4），依800×600虛擬畫面同比例放大。細灰框、黑底，不加外發光。三個小格以track寬度約7%取整數為格寬、間隔2px，間隙中央以高度40%的暗藍短接點連接；每格保留各自的上下藍色漸層，以內嵌SVG遮罩描出橫放罐子的輪廓：上下邊水平，左右邊在中段同向鼓出約0.75邏輯像素。漸層面位於暗色接點上方，避免接點蓋住曲面；遮罩內嵌以支援直接開啟file://。群組寬度包含三格、兩段間隔及1px弧面餘量；progressPhase在2.4秒內從0到1，位移由負群組寬度移到track右界，overflow:hidden只顯示框內部分，再回左側循環。動畫與滑鼠累計登入條件分開。


## 手機開機觸控

activity.js以finishBoot共用滑鼠／觸控的winding:boot-finishing入口，統一經過停1秒、移動1秒收尾再進登入。觸控單指在黑色背景連續停留5秒觸發，離開黑色背景重置開始時間，回到黑色背景重新計時；達標前放開、cancel、失焦或隱藏頁面會清除接觸及計時器。優先用PointerEvent，無PointerEvent時使用TouchEvent；觸控期間不累計相容滑鼠事件。

activity.js以文字、外溢的品牌／XO及進度條矩形排除可見內容，不依賴pointer-events命中；Loading頁的isWindingBootBackground補充當前3D圖案投影邊界。投影邊界沿用render的頂點與比例更新；觸控每50ms檢查，避免旋轉圖案移到手指下方仍繼續計時。僅Loading停用瀏覽器的預設觸控捲動與長按選單，其餘頁面的文字編輯行為不變。
