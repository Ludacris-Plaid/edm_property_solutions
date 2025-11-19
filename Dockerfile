FROM php:8.2-apache

RUN a2enmod rewrite \
 && docker-php-ext-install curl

# Harden a bit
RUN sed -i 's/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf \
 && sed -i 's/ServerTokens OS/ServerTokens Prod/' /etc/apache2/conf-available/security.conf \
 && sed -i 's/ServerSignature On/ServerSignature Off/' /etc/apache2/conf-available/security.conf

WORKDIR /var/www/html
COPY . /var/www/html

# Ensure data dir exists and is writable (Render disk will mount here)
RUN mkdir -p /var/www/html/data && chown -R www-data:www-data /var/www/html