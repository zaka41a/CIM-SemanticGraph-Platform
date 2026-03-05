package com.cim.semanticgraph.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

@Slf4j
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        log.info("Configuring Security Filter Chain...");

        http
                // Stateless REST API does not need CSRF protection
                .csrf(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/actuator/info").permitAll()
                        .requestMatchers("/swagger-ui/**", "/api-docs/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/cim/**", "/sparql/**", "/graphrag/**", "/graphrag/stream").permitAll()
                        .requestMatchers("/loadflow/**").permitAll()
                        .requestMatchers("/shacl/**").permitAll()
                        .requestMatchers("/excel/**").permitAll()
                        .requestMatchers("/system/**", "/history/**").permitAll()
                        .requestMatchers("/diagnostic/**", "/api/diagnostic/**").permitAll()
                        .requestMatchers("/reports/**").permitAll()
                        .anyRequest().authenticated()
                )
                .httpBasic(basic -> {});

        log.info("Security configuration completed");
        return http.build();
    }
}
