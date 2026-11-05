# DTN App

Aplicativo React Native com suporte para execução em contêiner Docker.

Este guia foi escrito para novos usuários e mostra o passo a passo completo, desde a preparação do ambiente até a execução do projeto com Docker.

## Requisitos

Antes de começar, instale os itens abaixo:

- Git
- Docker Desktop (Windows/macOS) ou Docker Engine (Linux)
- Node.js 22.11 ou superior (opcional, caso queira rodar comandos locais fora do contêiner)
- Editor de código como VS Code

> Recomendado: no Windows, ative o WSL 2 para melhor compatibilidade com o Docker.

## 1. Clone o repositório

Abra o terminal e execute:

```bash
git clone https://github.com/Damacenno/dtn-app.git
cd dtn-app
```

Se você já tiver o projeto em pasta local, basta entrar na pasta:

```bash
cd caminho/para/o/projeto
```

## 2. Verifique a estrutura do projeto

Na raiz do projeto, você deve encontrar arquivos como:

- `package.json`
- `docker-compose.yml`
- `docker/`
- `src/`
- `App.tsx`

O arquivo `docker-compose.yml` já está configurado para subir o ambiente do React Native.

## 3. Inicie o Docker

Certifique-se de que o Docker esteja em execução:

- Windows/macOS: abra o Docker Desktop e aguarde o ícone ficar ativo
- Linux: verifique se o daemon do Docker está iniciado

## 4. Suba o ambiente com Docker Compose

Na raiz do projeto, execute:

```bash
docker compose up --build
```

Esse comando irá:

- construir a imagem do contêiner
- instalar as dependências do projeto
- iniciar o Metro Bundler do React Native
- expor a porta `8081`

## 5. Acesse o Metro

Após o comando iniciar corretamente, o projeto ficará disponível no endereço:

```text
http://localhost:8081
```

Esse endereço é usado pelo Metro Bundler para servir o código JavaScript do app.

## 6. Execute o app em um emulador ou dispositivo

O contêiner configurado neste projeto inicia o Metro, mas a execução real do app depende do ambiente em que você está trabalhando:

### Android

Se você tiver um emulador Android ou um dispositivo conectado:

```bash
npm run android
```

> Se o ambiente local não estiver configurado para Android, siga a documentação oficial do React Native para instalar Android SDK, SDK Tools e variáveis de ambiente.

### iOS

Para iOS, é necessário um ambiente macOS com Xcode instalado:

```bash
npm run ios
```

## 7. Comandos úteis

### Reiniciar o ambiente

```bash
docker compose down
docker compose up --build
```

### Ver logs do contêiner

```bash
docker compose logs -f
```

### Parar os containers

```bash
docker compose down
```

### Rebuild sem cache

```bash
docker compose build --no-cache
```

## 8. Estrutura de execução do Docker

O projeto usa o arquivo `docker-compose.yml`, que define o serviço `react-native` com:

- build do Dockerfile em `docker/react-native/Dockerfile`
- volume do projeto montado em `/app`
- volume para `node_modules`
- porta `8081:8081`
- comando de inicialização do Metro

Isso facilita o desenvolvimento em qualquer máquina com Docker, sem necessidade de configurar o ambiente do Node manualmente em cada máquina.

## 9. Solução de problemas comuns

### Erro: Docker não inicia

- verifique se o Docker Desktop está rodando
- reinicie o serviço do Docker
- no Windows, verifique se o WSL 2 está habilitado

### Erro: porta 8081 em uso

- verifique se outra aplicação já está usando a porta `8081`
- pare o processo conflitante ou altere a porta no arquivo `docker-compose.yml`

### Erro de dependências

Se o contêiner falhar ao instalar pacotes, execute:

```bash
docker compose up --build --force-recreate
```

### O projeto não abre no emulador

- confirme que o Metro está rodando em `http://localhost:8081`
- verifique se o emulador ou dispositivo está conectado e pronto
- confirme se o ambiente Android/iOS está corretamente configurado no computador

## 10. Próximo passo

Depois que o projeto subir com sucesso, você pode começar a editar os arquivos em `src/` e `App.tsx`. O Metro faz atualização automática quando os arquivos são salvos.

Se quiser, também pode rodar os comandos locais diretamente:

```bash
npm install
npm start
```

Mas para novos usuários, a forma mais simples e padronizada é usar o Docker:

```bash
docker compose up --build
```

## Resumo rápido

```bash
git clone https://github.com/Damacenno/dtn-app.git
cd dtn-app
docker compose up --build
```

Acesse:

```text
http://localhost:8081
```

Pronto. O ambiente do projeto foi iniciado com Docker.

