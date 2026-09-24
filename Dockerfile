# Static hosting for SAM: docker build -t sam . && docker run --rm -p 8080:80 sam
FROM nginx:alpine
COPY index.html style.css GUIDE.html /usr/share/nginx/html/
COPY src /usr/share/nginx/html/src
COPY vendor /usr/share/nginx/html/vendor
