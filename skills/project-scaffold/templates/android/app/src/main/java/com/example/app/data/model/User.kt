package com.example.app.data.model

data class User(
    val id: String,
    val name: String,
    val email: String,
    val avatarUrl: String? = null
)
