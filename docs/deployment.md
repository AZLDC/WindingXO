# 完整專案與GitHub Pages

此結構沿用GitHub Pages的`master / (root)`，不需要GitHub Actions或建置套件。根目錄的`index.html`載入滿版框架，五個HTML入口保持原名稱；程式、樣式與模型分別放在`assets/js`、`assets/css`、`assets/models`。Python桌面程式放在`native`，雙擊根目錄`RUN.cmd`啟動。

## Git同步（主要方式）

完整專案使用同一個儲存庫`git@github.com:AZLDC/WindingXO.git`及`master`分支。從現有遠端歷史繼續提交，保留既有網站網址與GitHub Pages的`master / (root)`設定。SSH驗證由使用者本機Git／SSH設定處理，專案不保存帳密、Token或私鑰。

日常修改後，先執行本專案的檢查並更新README，再提交及推送：

```powershell
git status
git add --all
git commit -m "更新功能與對應說明"
git push origin master
```

確認有其他電腦或GitHub網頁的變更時，先取得遠端變更並處理合併，再推送；不要使用force覆寫歷史。推送後由既有GitHub Pages流程發布，Python來源仍可從相同儲存庫取得。

## 手動上傳或分享完整專案

1. 使用`tools/package_project.py`產生的`WindingXO-project.zip`，解壓縮到空資料夾。
2. GitHub儲存庫選`Add file → Upload files`，上傳解壓後的全部內容，讓`index.html`與`assets`直接在儲存庫根目錄；不要只上傳ZIP，也不要多包一層資料夾。
3. 提交後保留`Settings → Pages → Deploy from a branch → master → / (root)`。既有網站網址不變。

先前平放在GitHub根目錄的舊JS／CSS已由`assets`內的新版本取代；它們不再被入口引用，確認新頁面正常後可另行清理。保留`assets/models/avatar-license.json`作為模型來源與授權追溯。

GitHub網頁手動上傳不會依`.gitignore`替你排除檔案，請用已封裝的內容。封裝包包含網頁、Python、測試、工具及文件，不含`.venv`、`texts`、`data`、`.scratch/local`、程式快取、圖譜產物或`.env`。使用Git用戶端推送時，這些本機資料也已列入`.gitignore`。

重新封裝：

```powershell
.venv\Scripts\python.exe tools/package_project.py
```

輸出位於`.scratch/local/releases/WindingXO-project.zip`。新增原始碼資料夾或根目錄入口時，需同步更新封裝器的來源清單。

## 資料與執行方式

- 網頁版只需根目錄五個HTML、`assets`與`.nojekyll`，可由GitHub Pages或一般靜態HTTP伺服器提供，也可直接開啟`index.html`。
- Python版透過`native/main.py`載入同一份根目錄`index.html`；虛擬環境首次由`RUN.cmd`建立。`texts`及`data`於本機執行時建立，不公開上傳。
- `tests`、`tools`、`docs`是完整原始碼的一部分，不會在GitHub Pages上執行Python程式。
- 網頁筆記存在每位訪客自己的IndexedDB。此搬移保留網域、頁面名稱與資料庫名稱，並未提供跨瀏覽器同步功能。
