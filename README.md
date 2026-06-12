# DATApesquise Research Platform 🛰️

> **Clean Architecture + Modular Monolith + ODK Collect Server + Container-First**

[![Docker Compatible](https://img.shields.io/badge/Docker-Ready-blue.svg?logo=docker)](./docker-compose.yml)
[![Linux Ubuntu/Debian](https://img.shields.io/badge/OS-Ubuntu%20%7C%20Debian-orange.svg?logo=linux)](./deploy.sh)
[![ODK Collect Compatible](https://img.shields.io/badge/ODK%20Collect-Compatible-green.svg)](https://getodk.org)
[![Clean Architecture](https://img.shields.io/badge/Architecture-Clean%20Monolith-purple.svg)](#arquitetura)

Uma plataforma integrada de alta performance e resiliência projetada para a gestão de pesquisas de campo no interior, com suporte a **validação de lógica de pulo condicional**, **coleta geolocalizada no mapa**, **auditoria de gravação de áudio** e **sincronização nativa com o aplicativo ODK Collect (Android)**.

---

## 🏗️ Arquitetura

O sistema adota os princípios da **Clean Architecture** organizados em um **Monolito Modular**, garantindo desacoplamento total das regras de negócio puras em relação a frameworks e banco de dados.

```mermaid
graph TD
    subgraph Interfaces (Rotas & SPA)
        A[index.html / app.js] -->|HTTP REST / ODK API| B[routes.js]
    end
    subgraph Orchestration (Casos de Uso)
        B --> C[formFlow.js]
        B --> D[commandGuard.js]
    end
    subgraph Core (Regras de Negócio Puras)
        C --> E[skipLogic.js]
        D --> F[rbac.js]
        C --> G[entities.js]
    end
    subgraph Infrastructure (Drivers)
        B --> H[database.js SQLite]
        B --> I[jsonLogger.js]
    end
    subgraph Services (Integrações Externas)
        D --> J[externalAlerts.js]
        B --> K[audioStorage.js]
    end
```

### Divisão de Camadas:
* **Core (Regras Puras)**: Contém as entidades principais ([entities.js](src/core/entities.js)), a matriz declarativa de permissões operacionais ([rbac.js](src/core/rules/rbac.js)) e o validador de skip logic ([skipLogic.js](src/core/rules/skipLogic.js)). Não possui dependências externas.
* **Orchestration**: Coordena os fluxos de dados, como o versionamento automático de formulários ([formFlow.js](src/orchestration/formFlow.js)) e a proteção contra comandos destrutivos ([commandGuard.js](src/orchestration/commandGuard.js)).
* **Services**: Adaptadores para sistemas externos (como envio de alertas de segurança e upload de arquivos de áudio) contendo políticas explícitas de **Timeout, Retentativas, Circuit Breaker** e logs de latência.
* **Interfaces**: Controladores de rotas Express ([routes.js](src/interfaces/routes.js)) e o painel SPA de alta fidelidade visual ([index.html](src/interfaces/public/index.html)).
* **Infrastructure**: Banco de dados SQLite ([database.js](src/infrastructure/db/database.js)) e o Logger estruturado JSON ([jsonLogger.js](src/infrastructure/logger/jsonLogger.js)).

---

## 📱 Sincronização ODK Collect (Android)

Este servidor implementa a especificação oficial de protocolo **OpenRosa**, permitindo que o aplicativo móvel **ODK Collect** se conecte diretamente a este monolito:

1. **Compilação de Skip Logic (JSON para XForms)**:
   A lógica de pulo visual criada no painel (ex: *Se resposta for "Não" pula para Q4*) é compilada em tags `<bind relevant="not(/data/Q1 = 'Não')" />` no padrão internacional XForms.
2. **Endpoints ODK Disponíveis**:
   * `GET /api/formList`: Retorna a lista de formulários publicados.
   * `GET /api/odk/forms/:id`: Retorna o XML do formulário específico.
   * `POST /api/submission`: Recebe e processa os dados de entrevistas enviados pelo aplicativo de campo, incluindo a gravação de áudio em anexo.

---

## 🔒 Segurança Operacional (Read-Only)

Todos os módulos de rede operam estritamente em modo **READ-ONLY**:
* O sistema intercepta e **bloqueia** comandos críticos de roteadores de campo (ex: `reboot`, `reset`, `/system reset`, `/interface disable`).
* Comandos destrutivos geram logs estruturados JSON com severidade `CRITICAL` ou `HIGH` e **disparam alertas imediatos para APIs externas** através de canal tolerante a falhas (com Circuit Breaker).
* O console sugere rotinas manuais e seguras para operadores humanos em vez de executar códigos nos roteadores de campo diretamente.

---

## 🚀 Como Executar

### 1. Execução Simplificada Offline (Para Testes)
Se você não possui Node ou Docker instalados na máquina de teste, pode abrir o sistema completo direto no navegador via banco de dados virtual em `localStorage`:
1. Abra a pasta `src/interfaces/public/`.
2. Dê dois cliques em `index.html`. 

### 2. Execução em Produção / Homologação (Via Docker)
Para subir o servidor em ambiente completo com banco de dados SQLite e endpoints ODK ativos:
```bash
# Subir container (o SQLite compilará automaticamente no ambiente Linux Ubuntu slim)
docker-compose up --build -d
```
Acesse a plataforma em: `http://localhost:3000`.

---

## 🛠️ Deploy Automatizado (Debian / Ubuntu)

Para realizar o deploy completo em um servidor Debian/Ubuntu limpo, utilize o script automatizado [deploy.sh](deploy.sh):

```bash
# Dar permissão de execução
chmod +x deploy.sh

# Executar script de Deploy
./deploy.sh
```
*O script verificará as dependências, instalará o Docker e o Docker Compose se estiverem ausentes, criará os volumes de dados persistentes e subirá o container em segundo plano.*
