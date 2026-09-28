# Build context is the repository root: the api reads docker/postgres/seed.sql at start.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY api/Directory.Build.props api/
COPY api/src/DealerPortal.Api/DealerPortal.Api.csproj api/src/DealerPortal.Api/
RUN dotnet restore api/src/DealerPortal.Api/DealerPortal.Api.csproj
COPY api/ api/
RUN dotnet publish api/src/DealerPortal.Api/DealerPortal.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=5080
COPY --from=build /app .
COPY docker/postgres/seed.sql docker/postgres/seed.sql
USER app
EXPOSE 5080
ENTRYPOINT ["dotnet", "DealerPortal.Api.dll"]
