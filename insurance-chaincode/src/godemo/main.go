package main

import (
	"go-demo/controllers"
	"net/http"
)

func main() {
	controllers.RegisterControllers()
	http.ListenAndServe(":3000", nil)
}
