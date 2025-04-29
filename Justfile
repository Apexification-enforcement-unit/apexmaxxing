
build-frontend-prod:
    cd game-frontend; bun run build
    rm -fr game-backend/assets
    mv game-frontend/build game-backend/assets