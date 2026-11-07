-- Run once as root. Gives the API a user that can ONLY SELECT (extra safety).
CREATE USER IF NOT EXISTS 'school'@'%' IDENTIFIED BY 'password123';
GRANT SELECT ON schooldb.* TO 'school'@'%';
FLUSH PRIVILEGES;
