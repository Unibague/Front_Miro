#!/bin/bash
# Script para limpiar el servidor manualmente

echo "Conectándose al servidor para limpiar cambios locales..."

# Credenciales del servidor
SERVER_USER="miro"
SERVER_IP="172.19.18.49"
SERVER_PASSWORD="t3mp0_gr4d0"

sshpass -p "$SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_IP '
cd ~/MIRO_TEST/Front_Miro_Test
echo "Limpiando cambios locales..."
git reset --hard HEAD
git clean -fd
echo "Actualizando repositorio..."
git pull
echo "Listo!"
'