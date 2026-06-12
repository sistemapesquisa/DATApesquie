#!/bin/bash

# ==============================================================================
# Script de Deploy Automatizado - DATApesquise Research Platform
# Compatível com: Debian / Ubuntu Linux
# ==============================================================================

# Cores para output formatado
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # Sem Cor

echo -e "${BLUE}=== Iniciando Instalação & Deploy da DATApesquise Research Platform ===${NC}\n"

# 1. Verificar se está rodando como ROOT ou Sudo
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERRO] Este script precisa ser executado como root ou utilizando 'sudo'.${NC}"
  exit 1
fi

# 2. Identificar a distribuição Linux
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
else
    OS=$(uname -s)
    VER=""
fi

echo -e "${GREEN}[INFO] Sistema operacional detectado: $OS $VER${NC}"

# 3. Atualizar pacotes apt do sistema
echo -e "${YELLOW}[PROCESSO] Atualizando lista de pacotes apt do sistema...${NC}"
apt-get update -y && apt-get upgrade -y
if [ $? -ne 0 ]; then
    echo -e "${RED}[ALERTA] Falha ao atualizar pacotes apt. Continuando mesmo assim...${NC}"
fi

# 4. Verificar e Instalar o Docker se ausente
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}[PROCESSO] Docker não detectado. Iniciando instalação do Docker...${NC}"
    apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
    
    # Adicionar chave GPG oficial do Docker
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/${ID}/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Configurar repositório estável do Docker
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${jr_id:-$ID} \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
      
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io
    
    # Iniciar Docker e habilitar no boot
    systemctl start docker
    systemctl enable docker
    echo -e "${GREEN}[OK] Docker instalado e ativado com sucesso.${NC}"
else
    echo -e "${GREEN}[OK] Docker já está instalado no sistema: $(docker --version)${NC}"
fi

# 5. Verificar e Instalar o Docker Compose se ausente
# Suporta comandos "docker compose" (V2) ou "docker-compose" (V1)
DOCKER_COMPOSE_CMD=""
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
    echo -e "${GREEN}[OK] Comando 'docker compose' (V2) ativo.${NC}"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
    echo -e "${GREEN}[OK] Comando 'docker-compose' (V1) ativo.${NC}"
else
    echo -e "${YELLOW}[PROCESSO] Docker Compose não detectado. Instalando plugin compose...${NC}"
    apt-get install -y docker-compose-plugin
    
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE_CMD="docker compose"
        echo -e "${GREEN}[OK] Docker Compose V2 instalado com sucesso.${NC}"
    else
        echo -e "${RED}[ERRO] Falha ao instalar o Docker Compose. Por favor, instale-o manualmente.${NC}"
        exit 1
    fi
fi

# 6. Preparar estrutura de persistência local (Volume para SQLite)
echo -e "${YELLOW}[PROCESSO] Configurando diretórios de dados persistentes do SQLite...${NC}"
mkdir -p ./data
# Ajustar permissões para que o processo node no container possa ler/escrever no SQLite
chmod -R 777 ./data
echo -e "${GREEN}[OK] Pasta ./data criada e permissões liberadas.${NC}"

# 7. Configurar arquivo .env de produção
if [ ! -f .env ]; then
    echo -e "${YELLOW}[PROCESSO] Arquivo .env não encontrado. Criando a partir de .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        # Substitui a URL local fictícia para produção se desejado
        sed -i 's/development/production/g' .env
        echo -e "${GREEN}[OK] Arquivo .env de produção configurado.${NC}"
    else
        # Fallback cria arquivo manual
        cat <<EOT >> .env
PORT=3000
NODE_ENV=production
DATABASE_PATH=/app/data/database.sqlite
LOG_LEVEL=info
ALERT_API_URL=https://alerts.ext.datapesquise.corp/security-incidents
EOT
        echo -e "${YELLOW}[AVISO] .env.example não existia, criado .env padrão básico.${NC}"
    fi
else
    echo -e "${GREEN}[OK] Arquivo .env já existe. Mantendo configurações.${NC}"
fi

# 8. Executar Build e Deploy do container da plataforma
echo -e "${YELLOW}[PROCESSO] Subindo container em segundo plano via Docker Compose...${NC}"
$DOCKER_COMPOSE_CMD down &> /dev/null
$DOCKER_COMPOSE_CMD up -d --build

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}======================================================================${NC}"
    echo -e "${GREEN}    DEPLOY CONCLUÍDO COM SUCESSO! A PLATAFORMA ESTÁ ONLINE.          ${NC}"
    echo -e "${GREEN}======================================================================${NC}"
    echo -e "• Dashboard e API rodando em: ${YELLOW}http://localhost:3000${NC}"
    echo -e "• Endpoint ODK Collect FormList: ${YELLOW}http://localhost:3000/api/formList${NC}"
    echo -e "• Banco de dados SQLite persistido localmente em: ${YELLOW}./data/database.sqlite${NC}"
    echo -e "\nPara visualizar logs do container em tempo real execute:"
    echo -e "  > ${BLUE}docker logs -f datapesquise_monolith${NC}\n"
else
    echo -e "${RED}[ERRO] Falha ao subir os containers do Docker. Verifique a saída acima.${NC}"
    exit 1
fi
