# ギャラリー

AI が 1 つのプロンプトから描いた図です。クラウド構成、データベースやクラスの図、業務フロー、計画、いくつかのイラストがあります。図を開いて拡大したり、プロンプトをコピーしたりできます。エディタを開くと、そのプロンプトがチャットの入力欄に入った状態になるので、手を加えてから送信できます。

「Claude Code と MCP サーバー」と書かれた図は、Claude Code が [MCP サーバー](./claude-code.md)を通して描いたものです。サーバーの指示に従って、描いた結果のスクリーンショットを確認し、重なりを直しています。それ以外の図は Web アプリで描きました。同じプロンプトでも描くたびに少しずつ違う図になり、モデルによっても描き方が変わります。

<!-- demo: gallery -->

## 自分でプロンプトを書く

上のプロンプトに共通する点は次のとおりです。

- **図に入れる要素を挙げる**：「customers, addresses, orders, order items, products, categories and payments」。
- **要素どうしのつながりを書く**：「the manager approves or rejects it, finance checks the receipts and pays」。
- **図の種類を書く**：ER 図、シーケンス図、BPMN、スイムレーン、ガントチャート。
- **アイコンが必要なら名前で指定する**：AWS、Azure、GCP、Kubernetes、Cisco のアイコン。

依頼の書き方については、[描画と編集](./editor.md)、[AWS 構成図](./aws-architecture.md)、[フローチャートとシーケンス図](./flowcharts.md)も参照してください。
