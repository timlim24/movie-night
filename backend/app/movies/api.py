"""Public interface of the movies module. Other modules import only this file."""

from app.movies.tmdb import details, discover, genres, parallel, recommendations, search, summary

__all__ = ["details", "discover", "genres", "parallel", "recommendations", "search", "summary"]
