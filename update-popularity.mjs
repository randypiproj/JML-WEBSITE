  - name: Commit updated popularity.json
    run: |
      git config user.name "github-actions[bot]"
      git config user.email "github-actions[bot]@users.noreply.github.com"
      git add popularity.json
      if ! git diff --staged --quiet; then
        git commit -m "chore: update Spotify popularity metrics"
        git pull --rebase --autostash origin main
        git push origin HEAD:main
      fi
